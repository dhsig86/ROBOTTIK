#!/usr/bin/env node
/* File: scripts/validate_rules.mjs */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const ROOT = process.cwd();
const r = (p) => path.join(ROOT, p);

const AREAS = ["ouvido", "nariz", "garganta", "pescoco"];

function readJSON(p) {
  return JSON.parse(fs.readFileSync(r(p), "utf8"));
}

function listFiles(dir) {
  return fs.readdirSync(r(dir)).filter((f) => f.endsWith(".json"));
}

function makeAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function main() {
  const ajv = makeAjv();

  const diagSchemaPath = "src/schemas/diag.schema.json";
  const profilesSchemaPath = "src/schemas/profiles.schema.json";
  const lexSchemaPath = "src/schemas/lexicon.schema.json";

  // ✅ Compile UMA VEZ por schema e reutilize o validador
  const diagSchema = readJSON(diagSchemaPath);
  const profilesSchema = readJSON(profilesSchemaPath);
  const lexSchema = readJSON(lexSchemaPath);

  const validateDiag = ajv.compile(diagSchema);
  const validateProfiles = ajv.compile(profilesSchema);
  const validateLex = ajv.compile(lexSchema);

  let fail = false;

  // DIAG por área
  for (const area of AREAS) {
    const p = `src/engines/${area}/diag_${area}.json`;
    const ok = validateDiag(readJSON(p));
    if (!ok) {
      console.error(`❌ Invalid DIAG: ${r(p)}`);
      console.error(JSON.stringify(validateDiag.errors, null, 2));
      fail = true;
    } else {
      console.log(`✅ DIAG ok: ${r(p)}`);
    }
  }

  // PROFILES por área
  for (const area of AREAS) {
    const p = `src/engines/${area}/profiles_${area}.json`;
    if (!fs.existsSync(r(p))) {
      console.log(`✅ PROFILES ok: (absent) ${r(p)}`);
      continue;
    }
    const ok = validateProfiles(readJSON(p));
    if (!ok) {
      console.error(`❌ Invalid PROFILES: ${r(p)}`);
      console.error(JSON.stringify(validateProfiles.errors, null, 2));
      fail = true;
    } else {
      console.log(`✅ PROFILES ok: ${r(p)}`);
    }
  }

  // LEXICONS
  for (const f of listFiles("src/data/lexicons")) {
    const p = `src/data/lexicons/${f}`;
    const ok = validateLex(readJSON(p));
    if (!ok) {
      console.error(`❌ Invalid LEXICON: ${r(p)}`);
      console.error(JSON.stringify(validateLex.errors, null, 2));
      fail = true;
    } else {
      console.log(`✅ LEXICON ok: ${r(p)}`);
    }
  }

  if (fail) {
    console.log("VALIDATION_FAILED");
    process.exit(1);
  } else {
    console.log("VALIDATOR_OK");
    process.exit(0);
  }
}

main();
