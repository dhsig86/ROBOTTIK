/* File: src/core/triageEngine.js
 * Orquestra a triagem multi-área:
 *   - normaliza entrada → features canônicos
 *   - seleciona áreas (gated/always)
 *   - agrega evidências
 *   - funde por global_id (bayes)
 *   - delega os 4 outputs ao caseBuilder
 *
 * Dependências: conditionRegistry, evidenceStore, areaRouter, blend, caseBuilder
 */

import { loadRegistry } from "./conditionRegistry.js";
import { createEvidenceStore } from "./evidenceStore.js";
import { selectAreas } from "./areaRouter.js";
import { fuse } from "./blend.js";
import { buildOutputs } from "./caseBuilder.js";

/** util: normalização leve (acentos, caixa, pontuação) */
function normStr(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_\.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** mapeia texto/aliases → featureId canônico usando o featuresMap do registry */
function normalizeToFeatures(raw, registry) {
  const out = new Set();

  // 1) IDs já canônicos (checkboxes/seleções)
  const sel = Array.isArray(raw?.symptoms) ? raw.symptoms : [];
  for (const maybeId of sel) {
    const id = normStr(maybeId);
    if (registry.featuresMap[id]) out.add(id);
  }

  // 2) Texto livre (pequeno analisador baseado em aliases)
  const text = [raw?.text, raw?.queixa, raw?.hpi, raw?.observacoes].filter(Boolean).join(" ");
  if (text) {
    const T = " " + normStr(text) + " ";
    for (const [fid, feat] of Object.entries(registry.featuresMap)) {
      const tokens = [fid, ...(feat.aliases || [])].map(normStr).filter(Boolean);
      for (const tk of tokens) {
        if (!tk) continue;
        // busca aproximada simples: palavra isolada
        if (T.includes(" " + tk + " ")) {
          out.add(fid);
          break;
        }
      }
    }
  }

  // 3) Modificadores numéricos/categóricos passam em rawInput (não viram features)
  return out; // Set<string> de featureIds canônicos
}

/**
 * Função principal da triagem.
 * @param {Object} rawInput  Ex: { symptoms: ['rinorreia','obstrucao_nasal'], text: '...'; idade, sexo, ... }
 * @param {Object} options   Ex: { mode: 'gated' | 'always' }
 * @returns {Object} { intake, areas, ranking, outputs, debug }
 */
export async function triage(rawInput = {}, { mode = "gated" } = {}) {
  const registry = await loadRegistry();

  // 1) normaliza entrada para features canônicos
  const intakeSet = normalizeToFeatures(rawInput, registry);

  // 2) seleciona áreas
  const areas = selectAreas({ symptoms: Array.from(intakeSet) }, { mode, registry });

  // 3) popula evidence store (por enquanto, só presença/ausência)
  const ev = createEvidenceStore();
  for (const fid of intakeSet) {
    ev.add({ featureId: fid, source: "user" });
  }

  // 4) fusão bayesiana por global_id
  const ranking = fuse({ registry, evidence: ev, areas });

  // 5) outputs finais (resumo, alarmes, cuidados, via) — delega ao caseBuilder
  const outputs = buildOutputs({ rawInput, intakeSet, registry, areas, ranking });

  return {
    intake: Array.from(intakeSet),
    areas,
    ranking,
    outputs,
    debug: {
      evidence: ev.toJSON(),
      selectedAreas: areas,
    },
  };
}

/** util opcional: string de explicação resumida do top-1 */
export function explainTop(ranking, registry) {
  if (!Array.isArray(ranking) || !ranking.length) return "Sem hipótese predominante.";
  const top = ranking[0];
  const name =
    registry?.byGlobalId?.[top.global_id]?.entries?.[0]?.label ||
    top.global_id ||
    "Hipótese principal";
  const pct = Math.round((top.posterior || 0) * 100);
  return `${name} — probabilidade ~${pct}%`;
}
