/* File: src/core/nbq.js
 * Próximas Melhores Perguntas (NBQ) com ganho de informação + prioridades clínicas.
 *
 * Considera:
 *  - Regras dx (criteria: lr+/lr-/weight) e heuristics (when/boost)
 *  - Red flags globais (registry.redflags.common)
 *  - Regras de via_atendimento das áreas ativas
 *  - Intake (symptoms + modifiers) das áreas ativas
 *
 * Saída enriquecida para UI:
 *  [{ featureId, label, kind, unit?, options?, gainBits, bonus, score, rationale, priorityTags, question }]
 */

function log2(x) {
  return Math.log(x) / Math.log(2);
}
function entropy(dist) {
  let H = 0;
  for (const p of dist) if (p > 0) H -= p * log2(p);
  return H;
}
function normalize(arr) {
  const s = arr.reduce((a, b) => a + b, 0) || 1;
  return arr.map((x) => (x > 0 ? x / s : 0));
}
function hasFeatureLike(evidence, fid) {
  if (!evidence) return false;
  if (typeof evidence.has === "function") return evidence.has(fid);
  if (evidence instanceof Set) return evidence.has(fid);
  return false;
}

function featureLabel(fid, registry) {
  return registry?.featuresMap?.[fid]?.label || fid;
}
function dxLabel(gid, registry) {
  const e = registry?.byGlobalId?.[gid]?.entries?.[0];
  return e?.label || gid;
}

/** Coleta metadados de intake/modifiers por áreas ativas (tipo da pergunta, unidade, níveis) */
function collectIntakeMeta(registry, areas) {
  const symptomIds = new Set();
  const modifiers = Object.create(null);

  for (const a of areas || []) {
    const areaIntake = registry.byArea?.[a]?.intake || {};
    // symptoms → boolean por padrão
    for (const s of areaIntake.symptoms || []) {
      if (s?.id) symptomIds.add(s.id);
    }
    // modifiers → carregam type/unit/levels
    for (const m of areaIntake.modifiers || []) {
      if (!m?.id) continue;
      // último a escrever vence (normalmente iguais entre áreas, mas mantemos simples)
      modifiers[m.id] = {
        id: m.id,
        type: m.type || "boolean",
        unit: m.unit || null,
        levels: Array.isArray(m.levels) ? m.levels.slice() : null,
      };
    }
  }
  return { symptomIds, modifiers };
}

/**
 * Varre regras dx e heuristics para obter (LR_pos, LR_neg) por (gid, featureId)
 * - Se várias regras atingem o mesmo par:
 *    LR_pos = max(LR_pos),  LR_neg = min(LR_neg)
 * - weight >= 1 atua como LR_pos; 0 < weight < 1 atua como LR_neg
 * - heuristics.when/boost também contam como sinal (boost >=1 → LR_pos; <1 → LR_neg)
 */
function collectLREffectsForFeature(registry, gid, featureId) {
  const block = registry.byGlobalId?.[gid];
  let LR_pos = 1;
  let LR_neg = 1;

  if (!block?.entries?.length) return { LR_pos, LR_neg };

  for (const entry of block.entries) {
    for (const c of entry.criteria || []) {
      if (!Array.isArray(c.if) || !c.if.includes(featureId)) continue;

      if (typeof c["lr+"] === "number") LR_pos = Math.max(LR_pos, c["lr+"]);
      if (typeof c["lr-"] === "number") LR_neg = Math.min(LR_neg, c["lr-"]);

      if (typeof c.weight === "number") {
        if (c.weight >= 1) LR_pos = Math.max(LR_pos, c.weight);
        else if (c.weight > 0) LR_neg = Math.min(LR_neg, c.weight);
      }
    }
    for (const h of entry.heuristics || []) {
      if (!Array.isArray(h.when) || !h.when.includes(featureId)) continue;
      if (typeof h.boost === "number") {
        if (h.boost >= 1) LR_pos = Math.max(LR_pos, h.boost);
        else if (h.boost > 0) LR_neg = Math.min(LR_neg, h.boost);
      }
    }
  }
  return { LR_pos, LR_neg };
}

/** O feature aparece em critérios/heurísticas dessa hipótese? (para massa contextual) */
function featureMentionedIn(registry, gid, featureId) {
  const block = registry.byGlobalId?.[gid];
  if (!block?.entries?.length) return false;
  for (const entry of block.entries) {
    for (const c of entry.criteria || []) {
      if (Array.isArray(c.if) && c.if.includes(featureId)) return true;
    }
    for (const h of entry.heuristics || []) {
      if (Array.isArray(h.when) && h.when.includes(featureId)) return true;
    }
  }
  return false;
}

/** Junta candidatos de regras dx (top hipóteses), heuristics, red flags, via, intake */
function collectCandidateFeatures({ registry, ranking, areas, maxHyp = 8 }) {
  const cand = new Set();

  // 1) top hipóteses
  const top = (ranking || []).slice(0, maxHyp);
  for (const r of top) {
    const gid = r.global_id;
    const block = registry.byGlobalId?.[gid];
    if (!block?.entries?.length) continue;
    for (const e of block.entries) {
      for (const c of e.criteria || []) {
        if (Array.isArray(c.if)) for (const fid of c.if) cand.add(fid);
      }
      for (const h of e.heuristics || []) {
        if (Array.isArray(h.when)) for (const fid of h.when) cand.add(fid);
      }
    }
  }

  // 2) red flags globais
  for (const fid of Object.keys(registry.redflags?.common || {})) cand.add(fid);

  // 3) via_atendimento por área
  for (const a of areas || []) {
    const via = registry.byArea?.[a]?.via_atendimento || {};
    for (const fid of Object.keys(via)) cand.add(fid);
  }

  // 4) intake (symptoms + modifiers) por área
  for (const a of areas || []) {
    const intake = registry.byArea?.[a]?.intake || {};
    for (const s of intake.symptoms || []) if (s?.id) cand.add(s.id);
    for (const m of intake.modifiers || []) if (m?.id) cand.add(m.id);
  }

  return cand;
}

/** Ganho de informação esperado (EIG) para um feature */
function infoGainForFeature({ registry, ranking, featureId }) {
  const gids = ranking.map((r) => r.global_id);
  let p = ranking.map((r) => Math.max(0, Number(r.posterior) || 0));
  p = normalize(p);

  const H = entropy(p);
  let anySignalPos = false;
  let anySignalNeg = false;

  // f = presente
  const updPos = [];
  for (let i = 0; i < gids.length; i++) {
    const { LR_pos } = collectLREffectsForFeature(registry, gids[i], featureId);
    if (LR_pos && LR_pos !== 1) anySignalPos = true;
    updPos[i] = p[i] * (LR_pos || 1);
  }
  const p1 = normalize(updPos);
  const H1 = entropy(p1);

  // f = ausente
  const updNeg = [];
  for (let i = 0; i < gids.length; i++) {
    const { LR_neg } = collectLREffectsForFeature(registry, gids[i], featureId);
    if (LR_neg && LR_neg !== 1) anySignalNeg = true;
    updNeg[i] = p[i] * (LR_neg || 1);
  }
  const p0 = normalize(updNeg);
  const H0 = entropy(p0);

  if (!anySignalPos && !anySignalNeg) return { gain: 0, H, H1, H0 };

  // sem p(f-presente), usamos 0.5/0.5
  const EIG = 0.5 * (H - H1) + 0.5 * (H - H0);
  return { gain: EIG, H, H1, H0 };
}

/** Pequena explicação: que hipóteses mais “puxam” se o feature estiver presente */
function rationaleForFeature({ registry, ranking, featureId }) {
  const impacts = [];
  for (const r of ranking) {
    const { LR_pos } = collectLREffectsForFeature(
      registry,
      r.global_id,
      featureId,
    );
    const imp = (LR_pos || 1) - 1;
    if (imp > 0) {
      impacts.push({
        gid: r.global_id,
        label: dxLabel(r.global_id, registry),
        score: imp * (r.posterior || 0.0001),
      });
    }
  }
  impacts.sort((a, b) => b.score - a.score);
  const tops = impacts.slice(0, 2).map((x) => x.label);
  if (tops.length === 2) return `Ajuda a separar ${tops[0]} vs ${tops[1]}`;
  if (tops.length === 1) return `Aumenta a confiança em ${tops[0]}`;
  return "Ajuda a refinar o diagnóstico diferencial";
}

/** Bônus de prioridade (red flag, via, “massa” de hipóteses que citam o feature) */
function priorityBonus({ registry, ranking, areas, featureId }) {
  let bonus = 0;
  const tags = [];

  // red flag global?
  const isRedFlag = !!(
    registry.redflags?.common && featureId in registry.redflags.common
  );
  if (isRedFlag) {
    bonus += 0.75; // peso alto pra subir no topo
    tags.push("redflag");
  }

  // usado em via_atendimento das áreas ativas?
  let viaHit = false;
  for (const a of areas || []) {
    const via = registry.byArea?.[a]?.via_atendimento || {};
    if (featureId in via) {
      viaHit = true;
      break;
    }
  }
  if (viaHit) {
    bonus += 0.35;
    tags.push("via");
  }

  // massa das hipóteses que mencionam o feature
  const mass = ranking.reduce((acc, r) => {
    return (
      acc +
      (featureMentionedIn(registry, r.global_id, featureId)
        ? r.posterior || 0
        : 0)
    );
  }, 0);
  if (mass > 0) {
    bonus += 0.25 * Math.min(1, mass / 0.5); // escala suave até ~0.5 de massa
    if (mass > 0.1) tags.push("diferenciador");
  }

  return { bonus: Number(bonus.toFixed(3)), tags };
}

/** Tenta produzir um texto de pergunta coerente com o tipo (boolean/number/categorical) */
function makeQuestion({ fid, label, kind, unit, options }) {
  // Regras simples para IDs comuns
  if (fid === "duracao_dias") return "Há quantos dias começaram os sintomas?";
  if (fid === "piora_48_72h") return "Piorou nas últimas 48–72 horas?";

  if (kind === "number") {
    if (unit === "d") return `Há quantos dias ${label.toLowerCase()}?`;
    return `Qual o valor para: ${label}?`;
  }
  if (kind === "categorical" && Array.isArray(options) && options.length) {
    const opts = options.join(" / ");
    return `Qual opção se aplica a você para ${label.toLowerCase()}? (${opts})`;
  }
  // boolean (default)
  return `Você está com ${label.toLowerCase()}?`;
}

/**
 * API principal
 * @param {Object} args
 *  - registry, ranking, areas, evidence, max (nº de perguntas)
 * @returns [{ featureId, label, kind, unit?, options?, gainBits, bonus, score, rationale, priorityTags, question }]
 */
export function suggestNextQuestions({
  registry,
  ranking,
  areas,
  evidence,
  max = 3,
}) {
  const { symptomIds, modifiers } = collectIntakeMeta(registry, areas);
  const candidates = collectCandidateFeatures({ registry, ranking, areas });

  // remove já observados (presentes). Se passarmos a registrar ausências, podemos refinar.
  for (const fid of Array.from(candidates)) {
    if (hasFeatureLike(evidence, fid)) candidates.delete(fid);
  }

  const scored = [];
  for (const fid of candidates) {
    const { gain } = infoGainForFeature({ registry, ranking, featureId: fid });
    if (gain <= 0) continue;

    // tipo da pergunta
    let kind = "boolean";
    let unit = null;
    let options = null;

    if (modifiers[fid]) {
      kind = modifiers[fid].type || "boolean";
      unit = modifiers[fid].unit || null;
      options = modifiers[fid].levels || null;
    } else if (symptomIds.has(fid)) {
      kind = "boolean";
    } else {
      // fallback: se não aparecer em modifiers nem em symptoms, tratamos como boolean “genérico”
      kind = "boolean";
    }

    const { bonus, tags } = priorityBonus({
      registry,
      ranking,
      areas,
      featureId: fid,
    });
    const gainBits = Number(gain.toFixed(3));
    const score = Number((gainBits + bonus).toFixed(3));

    const label = featureLabel(fid, registry);
    const rationale = rationaleForFeature({
      registry,
      ranking,
      featureId: fid,
    });
    const question = makeQuestion({ fid, label, kind, unit, options });

    scored.push({
      featureId: fid,
      label,
      kind,
      unit,
      options,
      gainBits,
      bonus,
      score,
      rationale,
      priorityTags: tags,
      question,
    });
  }

  // ordena por score (ganho + prioridade)
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max);
}
