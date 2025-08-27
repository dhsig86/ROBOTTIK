#!/usr/bin/env node
/* File: scripts/check_consistency.mjs */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const AREAS = ["ouvido", "nariz", "garganta", "pescoco"];
const ROOT = process.cwd();
const r = (p) => path.join(ROOT, p);

const ALLOWED_ID = /^[a-z0-9_\.]+$/;
const ALLOWED_ROUTES = new Set([
  "ambulatorio_rotina",
  "telemedicina",
  "emergencia_geral",
  "emergencia_especializada",
]);

const ALLOWED_PROFILES = new Set([
  "crianca",
  "adolescente",
  "adulto",
  "idoso",
  "gestante",
  "alergico",
  "tabagista",
  "asma",
  "imunossuprimido",
  "diabetico",
  "autoimune",
  "etilista",
  "trauma",
]);

function readJSON(p) {
  return JSON.parse(fs.readFileSync(r(p), "utf8"));
}
function exists(p) {
  return fs.existsSync(r(p));
}

function loadFeatures() {
  const p1 = "src/data/global/features.json";
  const p2 = "src/data/features.json";
  return readJSON(exists(p1) ? p1 : p2);
}
function collectAreas() {
  const out = {};
  for (const area of AREAS) {
    const diag = readJSON(`src/engines/${area}/diag_${area}.json`);
    const profilesPath = `src/engines/${area}/profiles_${area}.json`;
    const profiles = exists(profilesPath) ? readJSON(profilesPath) : {};
    out[area] = { diag, profiles };
  }
  return out;
}

function main() {
  let errors = 0;
  let warns = 0;

  const features = loadFeatures();
  const featuresMap = new Map();
  for (const f of features.features || []) if (f?.id) featuresMap.set(f.id, f);

  const areas = collectAreas();

  const globalEntries = new Map(); // gid -> { labels:Set, locals:Set }
  const localSeen = new Set();

  const err = (s) => (errors++, console.error("❌", s));
  const warn = (s) => (warns++, console.warn("⚠️ ", s));
  const ok = (s) => console.log("✅", s);

  for (const [area, { diag, profiles }] of Object.entries(areas)) {
    for (const s of diag.intake?.symptoms || []) {
      if (!ALLOWED_ID.test(s.id))
        warn(`[${area}] intake.symptoms id inválido: "${s.id}"`);
      if (!featuresMap.has(s.id))
        warn(`[${area}] intake.symptoms "${s.id}" não existe em features.json`);
    }

    if (diag.via_atendimento) {
      for (const [flag, route] of Object.entries(diag.via_atendimento)) {
        if (!featuresMap.has(flag))
          warn(
            `[${area}] via_atendimento flag "${flag}" não existe em features.json`,
          );
        if (!ALLOWED_ROUTES.has(route))
          err(`[${area}] via_atendimento rota inválida "${route}"`);
      }
    }

    const areaLocalIds = new Set();
    for (const d of diag.dx || []) {
      if (!d.id) err(`[${area}] dx sem "id"`);
      if (d.id && !ALLOWED_ID.test(d.id))
        err(`[${area}] id inválido: "${d.id}"`);
      const localKey = `${area}.${d.id}`;
      if (areaLocalIds.has(d.id))
        err(`[${area}] id duplicado na área: "${d.id}"`);
      else areaLocalIds.add(d.id);
      if (localSeen.has(localKey))
        err(`id local duplicado globalmente: "${localKey}"`);
      else localSeen.add(localKey);

      if (d.global_id && d.id !== d.global_id)
        warn(
          `[${area}] "${d.id}": id != global_id ("${d.global_id}") — recomenda-se unificar`,
        );

      for (const c of d.criteria || []) {
        const arr = Array.isArray(c.if) ? c.if : [];
        for (const fid of arr)
          if (!featuresMap.has(fid))
            warn(
              `[${area}] "${d.id}": criteria.if → "${fid}" não está em features.json`,
            );
      }
      for (const fid of d.red_flags || [])
        if (!featuresMap.has(fid))
          warn(
            `[${area}] "${d.id}": red_flag → "${fid}" não está em features.json`,
          );

      const gid = d.global_id || d.id;
      if (!globalEntries.has(gid))
        globalEntries.set(gid, { labels: new Set(), locals: new Set() });
      const bucket = globalEntries.get(gid);
      if (d.label) bucket.labels.add(d.label);
      bucket.locals.add(localKey);
    }

    for (const [profile, block] of Object.entries(profiles || {})) {
      if (!ALLOWED_PROFILES.has(profile))
        warn(`[${area}] profile desconhecido "${profile}"`);
      const m = block?.multipliers || {};
      for (const [dxOrTag, val] of Object.entries(m)) {
        if (!dxOrTag.startsWith("@tags:")) {
          const existsDx = (diag.dx || []).some((x) => x.id === dxOrTag);
          if (!existsDx)
            warn(
              `[${area}] profiles.multipliers: dx "${dxOrTag}" não existe na área`,
            );
        }
        if (typeof val !== "number" || !isFinite(val) || val <= 0) {
          err(
            `[${area}] profiles.multipliers["${dxOrTag}"] deve ser número > 0`,
          );
        } else if (val < 0.1 || val > 3.0) {
          warn(
            `[${area}] profiles.multipliers["${dxOrTag}"] = ${val} fora do intervalo usual [0.1..3.0]`,
          );
        }
      }
    }
    ok(`Área ${area}: OK básico`);
  }

  for (const [gid, info] of globalEntries.entries()) {
    if (info.labels.size > 1)
      warn(
        `global_id "${gid}" com labels distintos: ${Array.from(info.labels).join(" | ")}`,
      );
  }

  const summary = `\n=== Consistency Report ===
  Áreas: ${AREAS.join(", ")}
  Features: ${featuresMap.size}
  Erros: ${errors}
  Warnings: ${warns}
`;
  if (errors) {
    console.error(summary);
    process.exit(1);
  } else {
    console.log(summary);
    process.exit(0);
  }
}

try {
  main();
} catch (e) {
  console.error("[check_consistency] Falhou:", e);
  process.exit(1);
}
