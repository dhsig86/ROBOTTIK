// scripts/fix_nariz.cjs
const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "..",
  "src",
  "engines",
  "nariz",
  "diag_nariz.json",
);
const raw = fs.readFileSync(file, "utf-8");
const json = JSON.parse(raw);

// 1) normaliza cada dx: garantir id e pretest
const seen = new Map(); // key: global_id, value: dx escolhido (o com mais critérios)
const fixedDx = [];

for (const dx of json.dx) {
  const clone = { ...dx };

  // schema atual exige 'id'
  if (!clone.id) {
    // usar o global_id como id local (padrão canônico)
    clone.id = clone.global_id || "";
  }

  // schema atual exige 'pretest' e não aceita 'pretest_global'
  if (
    typeof clone.pretest === "undefined" &&
    typeof clone.pretest_global !== "undefined"
  ) {
    clone.pretest = clone.pretest_global;
    delete clone.pretest_global;
  }

  // deduplicar por global_id (ficar com o mais "rico" em critérios)
  const key = clone.global_id || clone.id;
  const score = (clone.criteria?.length || 0) + (clone.heuristics?.length || 0);
  const prev = seen.get(key);
  if (!prev) {
    seen.set(key, { score, dx: clone });
  } else if (score > prev.score) {
    seen.set(key, { score, dx: clone });
  }
}

// montar array final
for (const { dx } of seen.values()) fixedDx.push(dx);

// ordena por label para ficar estável
fixedDx.sort((a, b) => (a.label || "").localeCompare(b.label || ""));

// persiste
const out = { ...json, dx: fixedDx };
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf-8");

console.log(
  `[fix-nariz] ok: ${fixedDx.length} diagnósticos normalizados (id + pretest).`,
);
