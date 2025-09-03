/* File: src/core/triageEngine.js
 * Orquestra a triagem multi-área:
 *   - normaliza entrada → features canônicos (symptomNormalizer)
 *   - seleciona áreas (gated/always)
 *   - agrega evidências (features + modificadores)
 *   - funde por global_id (bayes) com PERFIS
 *   - constrói outputs (caseBuilder) e enriquece com via_reason/alarmes/resumo
 */

import { loadRegistry } from "./conditionRegistry.js";
import { createEvidenceStore } from "./evidenceStore.js";
import { selectAreas } from "./areaRouter.js";
import { fuse } from "./blend.js";
import { buildOutputs } from "./caseBuilder.js";
import { normalizeRawInput } from "./symptomNormalizer.js";
import { deriveProfiles } from "./adjustClinico.js";
import { suggestNextQuestions } from "./nbq.js"; // [ADD]

/* Helpers para labels/via/alarmes ---------------------------------------- */
function labelOf(featureId, registry) {
  const f = registry.featuresMap?.[featureId];
  return f?.label || featureId;
}

/**
 * Decide a via de atendimento com base no primeiro feature encontrado nas regras
 * de cada área (na ordem de `areas`). Retorna via e a razão legível.
 */
function decideVia(evidenceSet, registry, areas) {
  for (const area of areas) {
    const rules = registry.byArea[area]?.via_atendimento || {};
    for (const fid of Object.keys(rules)) {
      if (evidenceSet.has(fid)) {
        return { via: rules[fid], reason: labelOf(fid, registry) };
      }
    }
  }
  return { via: "ambulatorio_rotina", reason: "Sem critérios de urgência" };
}

/**
 * Coleta red flags globais a partir do mapa `redflags.common` do registry
 * e devolve uma lista de labels legíveis.
 */
function collectAlarmes(evidenceSet, registry) {
  const map = registry.redflags?.common || {};
  const hits = [];
  for (const fid of Object.keys(map)) {
    if (evidenceSet.has(fid)) hits.push(labelOf(fid, registry));
  }
  return hits;
}

/**
 * Função principal da triagem.
 * @param {Object} rawInput  Ex: { symptoms: [...], text/hpi/queixa, idade, sexo, comorbidades, gestante }
 * @param {Object} options   Ex: { mode: 'gated' | 'always' }
 * @returns {Object} { intake, areas, ranking, outputs, profiles, modifiers, debug }
 */
export async function triage(rawInput = {}, { mode = "gated" } = {}) {
  const registry = await loadRegistry();

  // 1) normaliza entrada para features canônicos + extrai modificadores/demografia
  const { featureSet, modifiers, demographics } = await normalizeRawInput(
    rawInput,
    registry,
  );

  // 2) seleciona áreas
  const areas = selectAreas(
    { symptoms: Array.from(featureSet) },
    { mode, registry },
  );

  // 3) deriva perfis clínicos a partir da demografia/comorbidades
  const profiles = deriveProfiles(demographics);

  // 4) popula evidence store (presença/ausência + modificadores como features com valor)
  const ev = createEvidenceStore();
  for (const fid of featureSet) {
    ev.add({ featureId: fid, source: "user" });
  }
  for (const [k, v] of Object.entries(modifiers || {})) {
    ev.add({ featureId: k, source: "modifier", value: v });
  }

  // 5) fusão bayesiana por global_id (com perfis)
  const ranking = fuse({ registry, evidence: ev, areas, profiles });

  // [CHG][NBQ] Próximas melhores perguntas com estado rico p/ sentinelas
const nbqState = {
  registry,
  ranking,
  areas,
  evidence: ev,                       // evidenceStore já populado
  rawInput,                           // entrada original (symptoms/hpi)
  normalized: { features: featureSet }, // Set dos canônicos (evita renormalizar)
  features: Array.from(featureSet),   // redundância p/ coletor (array)
};

// cap 6: cabe sentinelas + discriminativas
const next_questions = await suggestNextQuestions(nbqState, { topK: 3, cap: 6 });

  // 7) outputs base (caseBuilder)
  let outputs = buildOutputs({
    rawInput,
    intakeSet: featureSet,
    registry,
    areas,
    ranking,
    next_questions,
  });

  // 7.1) Enriquecimento: via_reason + alarmes legíveis + resumo mínimo
  const evidenceSet = new Set(featureSet);
  const { via, reason } = decideVia(evidenceSet, registry, areas);
  const alarmes = collectAlarmes(evidenceSet, registry);

  const resumo = {
    paciente: {
      nome: rawInput.nome ?? null,
      idade: rawInput.idade ?? null,
      sexo: rawInput.sexo ?? null,
    },
    sintomas: Array.from(featureSet).map((id) => labelOf(id, registry)),
    hpi: rawInput.hpi || rawInput.text || null,
  };

  // Mescla sem quebrar o que já vem do buildOutputs
  outputs = {
    ...outputs,
    via: outputs.via ?? via,
    via_reason: outputs.via_reason ?? reason,
    alarmes: outputs.alarmes?.length ? outputs.alarmes : alarmes,
    resumo: outputs.resumo ?? resumo,
  };
  // Garante que as NBQs estejam nos outputs (mesmo que caseBuilder ignore)
  outputs.next_questions = outputs.next_questions ?? next_questions;

  // 7) retorno completo
  return {
    intake: Array.from(featureSet),
    areas,
    ranking,
    outputs,
    profiles: Array.from(profiles),
    modifiers,
    debug: {
      evidence: ev.toJSON(),
      selectedAreas: areas,
      profiles: Array.from(profiles),
      modifiers,
    },
  };
}

/** util opcional: string de explicação resumida do top-1 */
export function explainTop(ranking, registry) {
  if (!Array.isArray(ranking) || !ranking.length)
    return "Sem hipótese predominante.";
  const top = ranking[0];
  const name =
    registry?.byGlobalId?.[top.global_id]?.entries?.[0]?.label ||
    top.global_id ||
    "Hipótese principal";
  const pct = Math.round((top.posterior || 0) * 100);
  return `${name} — probabilidade ~${pct}%`;
}
