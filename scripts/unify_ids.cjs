// scripts/unify_ids.cjs
// Garante: id === global_id, migra pretest_global -> pretest, deduplica por id/global_id,
// e normaliza arrays (criteria/heuristics/tags). Roda em todas as áreas.

const fs = require("fs");
const path = require("path");

const AREAS = ["nariz", "garganta", "ouvido", "pescoco"];

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}
function saveJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

function pickRicher(a, b) {
  const sA = (a.criteria?.length || 0) + (a.heuristics?.length || 0);
  const sB = (b.criteria?.length || 0) + (b.heuristics?.length || 0);
  return sA >= sB ? a : b;
}

function normalizeDx(dx) {
  const out = { ...dx };

  // 1) id/global_id
  if (!out.id && out.global_id) out.id = out.global_id;
  if (!out.global_id && out.id) out.global_id = out.id;
  if (out.id && out.global_id && out.id !== out.global_id) {
    // Canoniza pelo global_id
    out.id = out.global_id;
  }

  // 2) pretest
  if (
    typeof out.pretest === "undefined" &&
    typeof out.pretest_global !== "undefined"
  ) {
    out.pretest = out.pretest_global;
  }
  delete out.pretest_global;

  // 3) arrays obrigatórias
  if (!Array.isArray(out.criteria)) out.criteria = [];
  if (!Array.isArray(out.heuristics)) out.heuristics = [];
  if (!Array.isArray(out.red_flags)) out.red_flags = [];
  if (!Array.isArray(out.tags)) out.tags = [];

  return out;
}

function processFile(area) {
  const file = path.join(
    __dirname,
    "..",
    "src",
    "engines",
    area,
    `diag_${area}.json`,
  );
  const json = loadJson(file);

  const bucket = new Map(); // key = id/global_id canonizado
  for (const dx of json.dx || []) {
    const norm = normalizeDx(dx);
    const key = norm.global_id || norm.id;
    if (!key) continue;
    const prev = bucket.get(key);
    bucket.set(key, prev ? pickRicher(prev, norm) : norm);
  }

  // ordena por label estável
  const dxOut = Array.from(bucket.values()).sort((a, b) =>
    (a.label || "").localeCompare(b.label || ""),
  );

  const out = { ...json, dx: dxOut };
  saveJson(file, out);
  console.log(`[unify-ids] ${area}: ${dxOut.length} dx normalizados.`);
}

for (const area of AREAS) processFile(area);
