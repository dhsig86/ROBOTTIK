// ROBOTTO — NBQ robusto (info gain aproximado + red flags + gates + dedupe/cap)
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
  const cap = Number(opts.cap ?? 3);
  
  const reg = await loadRegistry();
  const featuresMap = reg.featuresMap || reg.byFeatureId || {};
  const redflags = reg.redflags || reg.redflagsByFeatureId || {};
  const redSet = new Set(Array.isArray(redflags) ? redflags : Object.keys(redflags));

  const ranking = Array.isArray(state?.ranking) ? state.ranking.slice(0, topK) : [];
  const featureSet = state?.featureSet instanceof Set ? state.featureSet : new Set();

  const hypoList = [];
  for (const r of ranking) {
    const gid = r.global_id;
    const entry = reg.byGlobalId?.[gid];
    if (!entry) continue;
    const feats = collectFeats(entry);
    if (!feats.size) continue;
    hypoList.push({ gid, posterior: Number(r.posterior || 0), feats });
  }
  if (!hypoList.length) return [];

  const universe = new Set();
  for (const h of hypoList) for (const f of h.feats) if (!featureSet.has(f)) universe.add(f);
  if (!universe.size) return [];

  const scored = [];
  for (const fid of universe) {
    let pNum = 0, postSum = 0;
    const appears = [];
    for (const h of hypoList) {
      postSum += h.posterior || 0;
      if (h.feats.has(fid)) { pNum += h.posterior || 0.0001; appears.push(h.gid); }
    }
    const p = postSum > 0 ? pNum / postSum : appears.length / hypoList.length;

    const w = averageWeight(fid, hypoList, reg) || 1;
    let score = (p * (1 - p)) * w;
    if (redSet.has(fid)) score *= 1.75;

    const t2 = hypoList.slice(0, 2);
    if (t2.length === 2) {
      const a = t2[0].feats.has(fid) ? 1 : 0;
      const b = t2[1].feats.has(fid) ? 1 : 0;
      if (a !== b) score *= 1.25;
    }
    if (gatedSoon(fid, reg, featureSet)) score *= 1.1;

    scored.push({ fid, score, targets: appears });
  }

  scored.sort((a, b) => b.score - a.score);

  const out = [];
  for (const { fid, score, targets } of scored) {
    const meta = featuresMap?.[fid] || {};
    const kind = inferKind(meta);
    const { question, unit, options } = buildQuestion(fid, meta, kind);
    const rationale = makeRationale({ fid, targets, redSet, score, reg });
    out.push({ featureId: fid, kind, question, unit, options, rationale, targets, score: round(score) });
    if (out.length >= cap) break;
  }
  return out;
}

// Helpers
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
function gatedSoon(fid, reg, featureSet) {
  const wh = reg.featuresMap?.[fid]?.heuristics?.when;
  if (!wh) return false;
  const arr = [].concat(wh.any || [], wh.all || [], wh.none || []);
  return arr.some((c) => featureSet.has(c));
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
// Mantemos um alias apontando para 'suggestNBQ' para não quebrar.
export const suggestNextQuestions = suggestNBQ;

export default { suggestNBQ };