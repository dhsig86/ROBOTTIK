// src/core/nbq.js
// ROBOTTO — NBQ robusto (info gain aproximado + red flags + sentinelas + dedupe/cap)
// Baseado no seu esqueleto de NBQ com scoring por hipóteses e boost de red flags,
// expandido com "regras sentinelas" para cobrir emergências comuns em ORL
// (dispneia, odinofagia importante, otalgia complicada, epistaxe, paralisia facial).
//
// Mantém back-compat: export { suggestNextQuestions }.

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
  const cap  = Number(opts.cap  ?? 6); // aumentamos p/ caber seeds + ganho de info

  const reg = await loadRegistry();
  const featuresMap = reg.featuresMap || reg.byFeatureId || {};
  const redflags = reg.redflags || reg.redflagsByFeatureId || {};
  const redSet = new Set(Array.isArray(redflags) ? redflags : Object.keys(redflags));

  // ranking das hipóteses
  const ranking = Array.isArray(state?.ranking) ? state.ranking.slice(0, topK) : [];

  // conjunto de features já presentes (para não perguntar duplicado)
  const present = buildPresentFeaturesSet(state);

  // 1) Coletar, por hipótese, o conjunto de features relevantes
  const hypoList = [];
  for (const r of ranking) {
    const gid = r.global_id;
    const entry = reg.byGlobalId?.[gid];
    if (!entry) continue;
    const feats = collectFeats(entry);
    if (!feats.size) continue;
    hypoList.push({ gid, posterior: Number(r.posterior || 0), feats });
  }
  if (!hypoList.length) {
    // Sem hipóteses ainda: use apenas seeds sentinelas (ex.: usuário mandou “falta de ar” puro).
    return augmentWithSentinels({ reg, featuresMap, present, existing: [], cap });
  }

  // 2) Universo candidato = features que discriminam as hipóteses top-K e ainda não presentes
  const universe = new Set();
  for (const h of hypoList) for (const f of h.feats) if (!present.has(f)) universe.add(f);
  // fallback: se nada discrimina (ou tudo já presente), ainda assim aplicamos seeds
  // depois do bloco de scoring.

  // 3) Score aproximado por ganho de informação + boosts
  const scored = [];
  for (const fid of universe) {
    let pNum = 0, postSum = 0;
    const appears = [];
    for (const h of hypoList) {
      postSum += h.posterior || 0;
      if (h.feats.has(fid)) { pNum += h.posterior || 0.0001; appears.push(h.gid); }
    }
    // prob de presença condicional (~) nas top-K
    const p = postSum > 0 ? pNum / postSum : appears.length / Math.max(1, hypoList.length);

    // peso médio/likelihood quando disponível no registro
    const w = averageWeight(fid, hypoList, reg) || 1;

    // ganho ~ p * (1 - p)
    let score = (p * (1 - p)) * w;

    // boost se for red flag mapeada
    if (redSet.has(fid)) score *= 1.75;

    // pequena ênfase se o fid separa o top-2 (A vs B)
    const t2 = hypoList.slice(0, 2);
    if (t2.length === 2) {
      const a = t2[0].feats.has(fid) ? 1 : 0;
      const b = t2[1].feats.has(fid) ? 1 : 0;
      if (a !== b) score *= 1.25;
    }

    scored.push({ fid, score, targets: appears });
  }
  scored.sort((a, b) => b.score - a.score);

  // 4) Montar perguntas a partir do scored
  let out = [];
  for (const { fid, score, targets } of scored) {
    const meta = featuresMap?.[fid] || {};
    const kind = inferKind(meta);
    const { question, unit, options } = buildQuestion(fid, meta, kind);
    const rationale = makeRationale({ fid, targets, redSet, score, reg });
    out.push({
      featureId: fid, kind, question, unit, options,
      rationale, targets, score: round(score)
    });
    if (out.length >= cap) break;
  }

  // 5) Seeds sentinelas — cobrem emergências ORL e reforçam hipóteses
  out = augmentWithSentinels({ reg, featuresMap, present, existing: out, cap });

  // 6) Corta no cap e devolve
  return out.slice(0, cap);
}

// ---------------------- Seeds sentinelas (emergências & reforço) ------------
/**
 * Regras de “sentinela”: se sinais-chave estiverem presentes, sugerimos
 * confirmações/red flags ou qualificadores relevantes (inclusive quando o registro
 * ainda não ranqueou hipóteses).
 *
 * Todas as features daqui **existem no features.json** (IDs canônicos).
 * Se alguma não existir no registry carregado, é ignorada silenciosamente.
 */
const SENTINEL_RULES = [
  // Dispneia / Falta de ar → confirmar gravidade respiratória
  {
    whenAny: ["dispneia", "falta_de_ar"],
    askIfAbsent: [
      ["estridor", "Ao respirar, faz som alto/ronco/chiado (estridor)?"],
      ["tiragem_intercostal", "As costelas puxam para dentro ao respirar (tiragem)?"],
      ["cianose", "Lábios ou face ficam arroxeados (cianose)?"],
      ["uso_musculos_acessorios", "Está usando músculos do pescoço/ombros para respirar?"]
    ]
  },
  // Odinofagia importante / disfagia → via aérea superior/abscesso
  {
    whenAny: ["odinofagia", "disfagia"],
    askIfAbsent: [
      ["sialorreia", "Está babando/incapaz de engolir a própria saliva (sialorreia)?"],
      ["trismo", "Dificuldade para abrir a boca (trismo)?"],
      ["voz_batata_quente", "A voz está abafada, tipo 'batata quente'?"]
    ]
  },
  // Otalgia → gravidade/complicações
  {
    whenAny: ["otalgia", "dor_ouvido"],
    askIfAbsent: [
      ["febre", "Está com febre (≥ 38°C)?"],
      ["otorreia", "Há saída de secreção pelo ouvido (otorréia)?"],
      ["dor_edema_retroauricular", "Há dor/inchaço atrás da orelha (retroauricular)?"]
    ]
  },
  // Epistaxe → sangramento nasal
  {
    whenAny: ["epistaxe"],
    askIfAbsent: [
      ["hemorragia_abundante", "O sangramento pelo nariz é muito forte/contínuo (hemorragia abundante)?"],
      ["trauma_local", "Houve trauma/manipulação local (cutucar, batida)?"],
      ["hipertensao", "Tem hipertensão arterial (pressão alta) conhecida?"]
    ]
  },
  // Paralisia facial → descartar AVC/outros neurológicos e otológicos
  {
    whenAny: ["paralisia_facial"],
    askIfAbsent: [
      ["sinais_neurologicos_focais", "Percebeu outros sinais neurológicos (fraqueza de braço/perna, fala enrolada)?"],
      ["surdidez_subita_neurossensorial", "Houve perda auditiva súbita associada?"],
      ["mastoidite_suspeita", "Há dor/inchaço atrás da orelha ou pavilhão deslocado (mastóide)?"]
    ]
  }
];

function augmentWithSentinels({ reg, featuresMap, present, existing, cap }) {
  const out = existing.slice(); // copia

  // util de dedupe por featureId
  const hasQ = new Set(out.map(q => q.featureId));

  const exists = (id) => !!featuresMap?.[id];
  const pushQ = (id, text) => {
    if (!exists(id)) return;          // só se estiver no registry
    if (present.has(id)) return;      // não perguntar se já está como evidência
    if (hasQ.has(id)) return;         // não duplicar pergunta
    const meta = featuresMap[id] || {};
    const kind = inferKind(meta);
    const q = text || buildQuestion(id, meta, kind).question;
    out.unshift({
      featureId: id,
      kind,
      question: q,
      unit: undefined,
      options: kind === "categorical" ? buildQuestion(id, meta, kind).options : undefined,
      rationale: "Sentinela clínica (prioridade de segurança)",
      targets: [id],
      score: 2.0 // prioridade no topo; o corte por cap acontece no final
    });
    hasQ.add(id);
  };

  // detectar sentinelas presentes
  for (const rule of SENTINEL_RULES) {
    const triggered = (rule.whenAny || []).some((id) => present.has(id));
    if (!triggered) continue;
    for (const [fid, text] of rule.askIfAbsent || []) {
      pushQ(fid, text);
      if (out.length >= cap) break;
    }
    if (out.length >= cap) break;
  }

  // retorna respeitando cap no chamador
  return out;
}

// ----------------------------- Helpers (iguais/derivados do seu NBQ) --------
function buildPresentFeaturesSet(state) {
  const s = new Set();
  const addArr = (arr) => Array.isArray(arr) && arr.forEach((x) => x && s.add(String(x)));

  // 1) evidenceStore (quando presente)
  try {
    const ev = state?.evidence;
    if (ev && typeof ev.list === "function") {
      ev.list().forEach((e) => {
        if (e?.featureId && e?.value !== false) s.add(String(e.featureId));
      });
    }
  } catch {}

  // 2) features já normalizados ou raw.symptoms
  addArr(state?.features);
  addArr(state?.raw?.symptoms);

  return s;
}

function collectFeats(entry) {
  const s = new Set();
  const push = (x) => {
    if (!x) return;
    if (typeof x === "string") s.add(x);
    else if (typeof x === "object") s.add(x.id || x.featureId || x.fid);
  };
  if (Array.isArray(entry.features)) entry.features.forEach(push);
  if (Array.isArray(entry.criteria)) entry.criteria.forEach((c) => push(c?.featureId || c?.id || c));
  if (Array.isArray(entry.rules)) entry.rules.forEach((r) => push(r?.featureId || r?.id || r));
  if (Array.isArray(entry.signals)) entry.signals.forEach(push);
  if (Array.isArray(entry.entries)) entry.entries.forEach((e) => collectFeats(e).forEach((x) => s.add(x)));
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
  const label = meta?.label || fid.replaceAll("_", " ");
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
