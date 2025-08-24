/* Fusão bayesiana por global_id, somando contribuições de múltiplas áreas.
 * criteria[].if: string | string[] (interpretação: AND — todos presentes)
 * criteria[].lr+ / lr- / weight — multiplicadores em log
 * heuristics[].when + boost — multiplicador quando qualquer 'when' presente
 */
function logit(p) {
  const eps = 1e-12;
  const x = Math.min(1 - eps, Math.max(eps, p));
  return Math.log(x / (1 - x));
}
function invLogit(l) {
  const e = Math.exp(l);
  return e / (1 + e);
}
function allPresent(req, evidenceStore) {
  if (Array.isArray(req)) return req.every(fid => evidenceStore.has(fid));
  return req ? evidenceStore.has(req) : false;
}

function evalCriteria(criteria = [], evidenceStore, { area, localId }) {
  let logMult = 0;
  const steps = [];
  for (const c of criteria) {
    if (!c || !c.if) continue;
    if (!allPresent(c.if, evidenceStore)) continue;
    if (typeof c["lr+"] === "number" && c["lr+"] > 0) {
      const v = c["lr+"]; logMult += Math.log(v);
      steps.push({ type: "lr+", value: v, if: c.if, from: `${area}.${localId}` });
    }
    if (typeof c["lr-"] === "number" && c["lr-"] > 0) {
      const v = c["lr-"]; logMult += Math.log(v);
      steps.push({ type: "lr-", value: v, if: c.if, from: `${area}.${localId}` });
    }
    if (typeof c["weight"] === "number" && c["weight"] > 0) {
      const v = c["weight"]; logMult += Math.log(v);
      steps.push({ type: "weight", value: v, if: c.if, from: `${area}.${localId}` });
    }
  }
  return { logLR: logMult, steps };
}

function evalHeuristics(heuristics = [], evidenceStore, { area, localId }) {
  let logMult = 0;
  const steps = [];
  for (const h of heuristics) {
    const when = Array.isArray(h?.when) ? h.when : [];
    const boost = typeof h?.boost === "number" ? h.boost : 1.0;
    if (!when.length || boost <= 0 || boost === 1.0) continue;
    const matched = when.some(fid => evidenceStore.has(fid));
    if (matched) {
      logMult += Math.log(boost);
      steps.push({ type: "heuristic", value: boost, when, from: `${area}.${localId}` });
    }
  }
  return { logLR: logMult, steps };
}

/** registry: loadRegistry(); evidence: createEvidenceStore(); areas?: string[] */
export function fuse({ registry, evidence, areas = null } = {}) {
  const selectedAreas = Array.isArray(areas) && areas.length ? areas : registry.areas;
  const out = [];

  for (const [global_id, block] of Object.entries(registry.byGlobalId)) {
    const entries = block.entries.filter(e => selectedAreas.includes(e.area));
    if (!entries.length) continue;

    let logOdds = logit(block.pretest_global);
    const trail = [];

    for (const e of entries) {
      const { logLR: cLR, steps: cSteps } = evalCriteria(e.criteria, evidence, { area: e.area, localId: e.id });
      const { logLR: hLR, steps: hSteps } = evalHeuristics(e.heuristics, evidence, { area: e.area, localId: e.id });
      if (cLR !== 0 || hLR !== 0) {
        logOdds += cLR + hLR;
        trail.push(...cSteps, ...hSteps);
      }
    }

    out.push({
      global_id,
      pretest_global: block.pretest_global,
      posterior: invLogit(logOdds),
      evidence: trail,
      areas: block.areas,
    });
  }

  out.sort((a, b) => b.posterior - a.posterior);
  return out;
}
