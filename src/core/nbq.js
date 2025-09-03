// src/core/nbq.js
// ROBOTTO — NBQ robusto (ganho de informação + red flags + sentinelas ORL)
// Mantém compat: export { suggestNextQuestions }.

import { loadRegistry } from "./conditionRegistry.js";

/**
 * @typedef {Object} NBQ
 * @property {string} featureId
 * @property {"boolean"|"number"|"categorical"} kind
 * @property {string} question
 * @property {string=} unit
 * @property {Array<{value:string,label?:string,featureId?:string}>=} options
 * @property {string=} rationale
 * @property {string[]} targets
 * @property {number} score
 */

export async function suggestNBQ(state = {}, opts = {}) {
  const topK = Number(opts.topK ?? 3);
  const cap  = Number(opts.cap  ?? 6); // maior para caber seeds + ganho

  const reg = await loadRegistry();
  const featuresMap = reg.featuresMap || reg.byFeatureId || {};
  const redflags = reg.redflags || reg.redflagsByFeatureId || {};
  const redSet = new Set(Array.isArray(redflags) ? redflags : Object.keys(redflags));

  // Quais features já estão presentes (para não sugerir duplicado)?
  const present = buildPresentFeaturesSet(state);

  // Top-K hipóteses (para o componente de ganho de informação)
  const ranking = Array.isArray(state?.ranking) ? state.ranking.slice(0, topK) : [];

  // 1) Coletar, por hipótese, features que ajudam a discriminar
  const hypoList = [];
  for (const r of ranking) {
    const gid = r.global_id;
    const entry = reg.byGlobalId?.[gid];
    if (!entry) continue;
    const feats = collectFeats(entry);
    if (!feats.size) continue;
    hypoList.push({ gid, posterior: Number(r.posterior || 0), feats });
  }

  // Se não há hipóteses ainda, já caímos para as sentinelas (ex.: usuário digitou "dispneia")
  if (!hypoList.length) {
    return augmentWithSentinels({ reg, featuresMap, present, existing: [], cap });
  }

  // 2) Universo de candidatos = features das top-K que ainda NÃO estão presentes
  const universe = new Set();
  for (const h of hypoList) for (const f of h.feats) if (!present.has(f)) universe.add(f);

  // ✨ defesa extra: tira valores falsy/indefinidos
  for (const x of Array.from(universe)) {
    if (!x) universe.delete(x);
  }

  // Se o universo ficou vazio, ainda assim aplicamos sentinelas
  if (!universe.size) {
    return augmentWithSentinels({ reg, featuresMap, present, existing: [], cap });
  }

  // 3) Score ≈ ganho de informação (p*(1-p)) * peso médio, com boosts
  const scored = [];
  for (const fid of universe) {
    let pNum = 0, postSum = 0;
    const appears = [];
    for (const h of hypoList) {
      postSum += h.posterior || 0;
      if (h.feats.has(fid)) { pNum += h.posterior || 0.0001; appears.push(h.gid); }
    }
    const p = postSum > 0 ? pNum / postSum : appears.length / Math.max(1, hypoList.length);
    const w = averageWeight(fid, hypoList, reg) || 1;

    let score = (p * (1 - p)) * w;

    // Red flag mapeada? dá um gás
    if (redSet.has(fid)) score *= 1.75;

    // Separa top-2? leve boost
    const t2 = hypoList.slice(0, 2);
    if (t2.length === 2) {
      const a = t2[0].feats.has(fid) ? 1 : 0;
      const b = t2[1].feats.has(fid) ? 1 : 0;
      if (a !== b) score *= 1.25;
    }

    scored.push({ fid, score, targets: appears });
  }
  scored.sort((a, b) => b.score - a.score);

  // 4) Monta perguntas a partir do scored
  let out = [];
  for (const { fid, score, targets } of scored) {
    const meta = featuresMap?.[fid] || {};
    const kind = inferKind(meta);
    const { question, unit, options } = buildQuestion(fid, meta, kind);
    const rationale = makeRationale({ fid, targets, redSet, score, reg });
    out.push({ featureId: fid, kind, question, unit, options, rationale, targets, score: round(score) });
    if (out.length >= cap) break;
  }

  // 5) Seeds sentinelas — cobrem emergências ORL e reforçam hipóteses
  out = augmentWithSentinels({ reg, featuresMap, present, existing: out, cap });

  // 6) Corta no cap
  return out.slice(0, cap);
}

// ---------------------- Seeds sentinelas (emergências & reforço) ------------
/**
 * Regras de “sentinela”: se sinais-chave estiverem presentes, sugerimos
 * confirmações/red flags ou qualificadores relevantes.
 *
 * IDs aqui são **canônicos** e conferidos no registry. Se algum não existir, é ignorado.
 * (ajustado ao seu features.json atual)
 */
const SENTINEL_RULES = [
  // Dispneia → confirmar gravidade respiratória
  {
    whenAny: ["dispneia", "falta_de_ar"],
    askIfAbsent: [
      ["estridor", "Ao respirar, sai um som alto/ronco/chiado (estridor)?"]
      // Removidos: 'cianose', 'tiragem_intercostal', 'uso_musculos_acessorios' (não existem no seu features.json atual)
    ]
  },
  // Odinofagia/disfagia → via aérea superior / abscesso
  {
    whenAny: ["odinofagia", "disfagia", "dor_de_garganta"],
    askIfAbsent: [
      ["sialorreia", "Está babando/incapaz de engolir a própria saliva (sialorreia)?"],
      ["trismo", "Dificuldade para abrir a boca (trismo)?"],
      ["voz_batata_quente", "A voz está abafada, tipo 'batata quente'?"]
    ]
  },
  // Otalgia → gravidade/complicações
  {
    whenAny: ["otalgia", "dor_ouvido","dor_no_ouvido"],
    askIfAbsent: [
      ["febre", "Está com febre (≥ 38°C)?"],
      ["otorreia", "Há saída de secreção pelo ouvido (otorréia)?"],
      ["dor_edema_retroauricular", "Há dor/inchaço atrás da orelha (retroauricular)?"]
    ]
  },
  // Epistaxe → sangramento nasal importante
  {
    whenAny: ["epistaxe", "sangramento_pelo_nariz"],
    askIfAbsent: [
      ["hemorragia_abundante", "O sangramento pelo nariz é muito forte/contínuo (hemorragia abundante)?"],
      ["trauma_local", "Houve trauma/manipulação local (cutucar, batida)?"],
      ["hipertensao", "Tem hipertensão arterial (pressão alta) conhecida?"]
    ]
  },
  // Paralisia facial → rastrear neurológico/otológico
  {
    whenAny: ["paralisia_facial", "boca_torta", "fraqueza_muscular_face"],
    askIfAbsent: [
      ["sinais_neurologicos_focais", "Percebeu outros sinais neurológicos (fraqueza de braço/perna, fala enrolada)?"],
      ["surdidez_subita", "Houve perda auditiva súbita associada?"],
      ["mastoidite_suspeita", "Há dor/inchaço atrás da orelha ou pavilhão deslocado (mastóide)?"]
    ]
  }
];

function augmentWithSentinels({ reg, featuresMap, present, existing, cap }) {
  const out = existing.slice();
  const hasQ = new Set(out.map(q => q.featureId));
  const exists = (id) => !!featuresMap?.[id];

  const pushQ = (id, text) => {
    if (!exists(id)) return;
    if (present.has(id)) return;
    if (hasQ.has(id)) return;
    const meta = featuresMap[id] || {};
    const kind = inferKind(meta);
    const base = buildQuestion(id, meta, kind);
    out.unshift({
      featureId: id,
      kind,
      question: text || base.question,
      unit: base.unit,
      options: base.options,
      rationale: "Sentinela clínica (prioridade de segurança)",
      targets: [id],
      score: 2.0 // entra no topo; cap aplicado depois
    });
    hasQ.add(id);
  };

  // dispare regras de sentinela quando o gatilho existir entre as evidências
  const triggeredBy = (ids) => ids.some((x) => present.has(x));

  for (const rule of SENTINEL_RULES) {
    if (!triggeredBy(rule.whenAny || [])) continue;
    for (const [fid, text] of rule.askIfAbsent || []) {
      pushQ(fid, text);
      if (out.length >= cap) break;
    }
    if (out.length >= cap) break;
  }

  return out;
}

// ----------------------------- Helpers --------------------------------------
function buildPresentFeaturesSet(state) {
  const s = new Set();
  const addArr = (arr) => {
    if (!arr) return;
    if (Array.isArray(arr)) arr.forEach((x) => x && s.add(String(x)));
    else if (arr instanceof Set) Array.from(arr).forEach((x) => x && s.add(String(x)));
  };

  // 1) evidenceStore (quando disponível)
  try {
    const ev = state?.evidence;
    if (ev && typeof ev.list === "function") {
      ev.list().forEach((e) => {
        if (e?.featureId && e?.value !== false) s.add(String(e.featureId));
      });
    }
  } catch {}

  // 2) features já normalizados/derivados
  addArr(state?.features);                   // pode ser Array ou Set
  addArr(state?.normalized?.features);       // Set do normalizador
  addArr(state?.intake?.features);           // se o triage montar um intake

  // 3) raw symptoms (originais)
  addArr(state?.rawInput?.symptoms);
  addArr(state?.raw?.symptoms);

  return s;
}


function collectFeats(entry) {
  const s = new Set();

  const pushMaybe = (raw) => {
    if (!raw) return;
    let id = null;
    if (typeof raw === "string") id = raw;
    else if (typeof raw === "object") id = raw.id || raw.featureId || raw.fid || null;
    if (id) s.add(String(id));
  };

  const scan = (arr) => Array.isArray(arr) && arr.forEach((x) => pushMaybe(x));

  scan(entry?.features);
  scan(entry?.criteria);
  scan(entry?.rules);
  scan(entry?.signals);

  if (Array.isArray(entry?.entries)) {
    entry.entries.forEach((e) => {
      collectFeats(e).forEach((x) => s.add(x));
    });
  }

  return s;
}


function averageWeight(fid, hypos, reg) {
  let acc = 0, n = 0;
  for (const h of hypos) {
    const e = reg.byGlobalId?.[h.gid];
    if (!e) continue;
    const w = collectWeights(fid, e);
    for (const x of w) { acc += x; n++; }
  }
  return n ? acc / n : 1;
}
function collectWeights(fid, entry) {
  const out = [];
  const check = (obj) => {
    const id = obj?.id || obj?.featureId || obj?.fid;
    if (id !== fid) return;
    if (typeof obj?.w === "number") out.push(obj.w);
    else if (typeof obj?.weight === "number") out.push(obj.weight);
    else if (typeof obj?.lr === "number") out.push(obj.lr);
    else if (typeof obj?.lr_pos === "number") out.push(obj.lr_pos);
  };
  const scan = (arr) => Array.isArray(arr) && arr.forEach((x) => { if (typeof x === "object") check(x); });
  scan(entry.features); scan(entry.criteria); scan(entry.rules); scan(entry.signals);
  if (Array.isArray(entry.entries)) entry.entries.forEach((e) => collectWeights(fid, e).forEach((x) => out.push(x)));
  return out;
}
function inferKind(meta) {
  const k = meta?.kind || meta?.type;
  if (k === "number" || k === "numeric") return "number";
  if (k === "categorical" || Array.isArray(meta?.options)) return "categorical";
  return "boolean";
}
function buildQuestion(fid, meta, kind) {
  const idStr = typeof fid === "string" ? fid : (fid == null ? "" : String(fid));
  const label = meta?.label || (idStr ? idStr.replace(/_/g, " ") : "este sinal");
  if (kind === "number") {
    const unit = meta?.unit || meta?.units || undefined;
    return { question: meta?.question || `Qual o valor de ${label}?`, unit, options: undefined };
  }
  if (kind === "categorical") {
    const opts = Array.isArray(meta?.options)
      ? meta.options.map((o) => ({ value: String(o.value ?? o.id ?? o), label: String(o.label ?? o.value ?? o), featureId: o.featureId || o.id }))
      : [];
    return { question: meta?.question || `Sobre ${label}, escolha a opção:`, unit: undefined, options: opts };
  }
  return { question: meta?.question || `Você tem ${label}?`, unit: undefined, options: undefined };
}
function makeRationale({ fid, targets, redSet, score, reg }) {
  const label = reg.featuresMap?.[fid]?.label || fid;
  const tg = targets.slice(0, 3).join(", ");
  const rf = redSet.has(fid) ? " [red flag]" : "";
  return `${label} discrimina ${tg}; ganho≈${round(score)} bits${rf}`;
}
function round(x) { return Math.round(x * 1000) / 1000; }

// --- Back-compat ------------------------------------------------------------
// Algumas versões do triageEngine importam 'suggestNextQuestions'.
export const suggestNextQuestions = suggestNBQ;

export default { suggestNBQ };
