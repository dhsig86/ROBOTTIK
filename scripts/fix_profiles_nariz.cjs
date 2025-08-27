// scripts/fix_profiles_nariz.cjs
const fs = require("fs");
const path = require("path");

const diagPath = path.join(
  __dirname,
  "..",
  "src",
  "engines",
  "nariz",
  "diag_nariz.json",
);
const profPath = path.join(
  __dirname,
  "..",
  "src",
  "engines",
  "nariz",
  "profiles_nariz.json",
);

const diag = JSON.parse(fs.readFileSync(diagPath, "utf-8"));
const validIds = new Set(diag.dx.map((d) => d.id || d.global_id));

const mapLegacy = new Map([
  ["rinite_viral", "uri_nasofaringite"],
  ["sinusite_aguda_nao_complicada", "rinossinusite_aguda"],
]);

let prof = {};
try {
  prof = JSON.parse(fs.readFileSync(profPath, "utf-8"));
} catch {}
const out = { multipliers: {} };

const src = prof.multipliers || {};
for (const [k, v] of Object.entries(src)) {
  if (k.startsWith("@tags:")) continue; // remover tags por enquanto (schema)
  const mapped = mapLegacy.get(k) || k;
  if (!validIds.has(mapped)) {
    console.warn(`[profiles:nariz] ignorando chave não reconhecida: ${k}`);
    continue;
  }
  out.multipliers[mapped] = v;
}

// seed mínimo se vazio
if (Object.keys(out.multipliers).length === 0) {
  out.multipliers["uri_nasofaringite"] = {
    crianca: 1.3,
    idoso: 1.1,
    imunossuprimido: 1.2,
  };
  out.multipliers["rinite_alergica"] = {
    alergico: 1.4,
    crianca: 1.1,
    idoso: 0.8,
    tabagista: 0.8,
  };
  out.multipliers["rinossinusite_aguda"] = {
    crianca: 1.1,
    idoso: 1.1,
    imunossuprimido: 1.15,
    tabagista: 1.1,
  };
  out.multipliers["rinossinusite_aguda_bacteriana"] = {
    crianca: 1.2,
    idoso: 1.3,
    imunossuprimido: 1.4,
    tabagista: 1.1,
  };
}

fs.writeFileSync(profPath, JSON.stringify(out, null, 2) + "\n", "utf-8");
console.log("[profiles:nariz] normalizado com sucesso.");
