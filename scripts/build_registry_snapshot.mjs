// scripts/build_registry_snapshot.mjs
// Gera registry.snapshot.json com "features: []" (array) + contadores,
// a partir de src/data/global/features.json (fonte da verdade no front).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// === paths de entrada/saída ===
const FEATURES_SRC = path.join(ROOT, "src", "data", "global", "features.json");
const REDFLAGS_SRC = path.join(ROOT, "src", "data", "redflags.map.json");
const SNAPSHOT_OUT = path.join(ROOT, "registry.snapshot.json");

// === util ===
function normStr(x) {
  return (x ?? "").toString().trim();
}
function asArrayAliases(aliases) {
  // Aceita string ou array. Se string, tenta dividir por vírgula/semicolon/pipe.
  // Se não houver delimitadores, mantém como 1 item (frase completa).
  if (Array.isArray(aliases)) {
    return [...new Set(aliases.map((s) => normStr(s)).filter(Boolean))];
  }
  const raw = normStr(aliases);
  if (!raw) return [];
  const hasDelims = /[,;|]/.test(raw);
  if (!hasDelims) {
    return [raw]; // mantemos a frase inteira (ex.: "garganta doendo dor ao engolir")
  }
  return [
    ...new Set(
      raw
        .split(/[;|,]/g)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function ensureIdFormat(id) {
  // Constraint do projeto: ^[a-z0-9_\.]+$
  const ok = /^[a-z0-9_.]+$/.test(id);
  if (!ok) {
    throw new Error(
      `ID de feature inválido "${id}" — precisa casar com ^[a-z0-9_\\.]+$`,
    );
  }
}

// === pipeline ===
function loadJSON(p) {
  const txt = fs.readFileSync(p, "utf8");
  return JSON.parse(txt);
}

function buildSnapshot() {
  // 1) features.json (fonte canônica)
  const featDoc = loadJSON(FEATURES_SRC);
  if (!featDoc || !Array.isArray(featDoc.features)) {
    throw new Error(
      `Arquivo ${path.relative(ROOT, FEATURES_SRC)} inválido: precisa ter { features: [] }`,
    );
  }

  // 2) normalizar features
  const features = featDoc.features.map((f) => {
    const id = normStr(f.id);
    const label = normStr(f.label);
    ensureIdFormat(id);
    if (!label) throw new Error(`Feature ${id} sem label`);
    const aliases = asArrayAliases(f.aliases);
    return { id, label, aliases };
  });

  // 3) redflags (apenas contagem para debug/telemetria no snapshot)
  let redflagsCount = 0;
  try {
    const red = loadJSON(REDFLAGS_SRC);
    if (red && typeof red === "object") {
      redflagsCount = Object.keys(red).length;
    }
  } catch {
    // opcional
  }

  // 4) somas
  const aliasesCount = features.reduce(
    (acc, f) => acc + (Array.isArray(f.aliases) ? f.aliases.length : 0),
    0,
  );

  // 5) montar snapshot final
  const snapshot = {
    snapshot_version: new Date().toISOString(),
    sources: {
      features_json: "src/data/global/features.json",
      redflags_map: "src/data/redflags.map.json",
    },
    // >>> CAMPO QUE O BACKEND PRECISA <<<
    features, // array normalizado
    // meta/contadores úteis (não quebram o backend)
    features_count: features.length,
    aliases_count: aliasesCount,
    redflags_count: redflagsCount,
  };

  return snapshot;
}

function main() {
  const snap = buildSnapshot();
  const json = JSON.stringify(snap, null, 2) + "\n";
  fs.writeFileSync(SNAPSHOT_OUT, json, "utf8");
  console.log("✅ registry.snapshot.json gerado.");
  console.log(
    `   features: ${snap.features_count} | aliases: ${snap.aliases_count} | redflags: ${snap.redflags_count}`,
  );
}

main();
// ROBOTTO — client LLM triage (chama backend /api/triage se disponível) --- IGNORE ---
// [UI] controlador chat-like e estados. Sem implementação.
// [UI] render de probabilidades e 4 outputs. Sem implementação.
// Lê env.json de forma resiliente (local, GH Pages, paths relativos)
// Cacheado para evitar múltiplos fetches.