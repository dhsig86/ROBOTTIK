#!/usr/bin/env node
/* File: scripts/build_registry_snapshot.mjs */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const r = (p) => path.join(ROOT, p);
const AREAS = ["ouvido", "nariz", "garganta", "pescoco"];

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

function main() {
  const features = loadFeatures();
  const featuresMap = {};
  for (const f of features.features || []) featuresMap[f.id] = f;

  const byArea = {};
  const byGlobalId = {};

  for (const area of AREAS) {
    const diag = readJSON(`src/engines/${area}/diag_${area}.json`);
    const profilesPath = `src/engines/${area}/profiles_${area}.json`;
    const profiles = exists(profilesPath) ? readJSON(profilesPath) : {};

    byArea[area] = {
      intake: diag.intake,
      via_atendimento: diag.via_atendimento || {},
      profiles,
    };

    for (const d of diag.dx || []) {
      const gid = d.global_id || d.id;
      if (!byGlobalId[gid]) byGlobalId[gid] = [];
      byGlobalId[gid].push({
        area,
        id: d.id,
        label: d.label,
        pretest: d.pretest || null,
        tags: d.tags || [],
      });
    }
  }

  const snapshot = {
    features: Object.keys(featuresMap).length,
    byArea,
    byGlobalId,
  };
  fs.writeFileSync(
    r("registry.snapshot.json"),
    JSON.stringify(snapshot, null, 2),
  );
  console.log("✅ registry.snapshot.json gerado.");
}

main();
