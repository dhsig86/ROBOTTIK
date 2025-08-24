#!/usr/bin/env node
/**
 * Validador de regras clínicas para ROBOTTO (diag/lex/profiles).
 * Requer: npm i -D ajv ajv-formats
 */
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const ROOT = process.cwd();
const SCHEMA_DIR = path.join(ROOT, 'src', 'schemas');
const ENGINES_DIR = path.join(ROOT, 'src', 'engines');
const DATA_LEX_DIR = path.join(ROOT, 'src', 'data', 'lexicons');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function getFiles(dir, pattern) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(dent => {
    const p = path.join(dir, dent.name);
    if (dent.isDirectory()) out.push(...getFiles(p, pattern));
    else if (pattern.test(dent.name)) out.push(p);
  });
  return out;
}

function main() {
  // Desliga a validação do PRÓPRIO schema -> evita exigir metaschema 2020-12.
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateSchema: false
  });
  addFormats(ajv);

  const diagSchema = loadJson(path.join(SCHEMA_DIR, 'diag.schema.json'));
  const lexSchema = loadJson(path.join(SCHEMA_DIR, 'lexicon.schema.json'));
  const profilesSchema = loadJson(path.join(SCHEMA_DIR, 'profiles.schema.json'));

  const validateDiag = ajv.compile(diagSchema);
  const validateLex = ajv.compile(lexSchema);
  const validateProfiles = ajv.compile(profilesSchema);

  let ok = true;

  // diag_*.json
  for (const f of getFiles(ENGINES_DIR, /^diag_.*\.json$/)) {
    try {
      const j = loadJson(f);
      if (!validateDiag(j)) { ok = false; console.error(`❌ Invalid DIAG: ${f}`); console.error(validateDiag.errors); }
      else console.log(`✅ DIAG ok: ${f}`);
    } catch (e) { ok = false; console.error(`❌ JSON parse error: ${f}`); console.error(String(e)); }
  }

  // profiles_*.json
  for (const f of getFiles(ENGINES_DIR, /^profiles_.*\.json$/)) {
    try {
      const j = loadJson(f);
      if (!validateProfiles(j)) { ok = false; console.error(`❌ Invalid PROFILES: ${f}`); console.error(validateProfiles.errors); }
      else console.log(`✅ PROFILES ok: ${f}`);
    } catch (e) { ok = false; console.error(`❌ JSON parse error: ${f}`); console.error(String(e)); }
  }

  // lexicons/*.json
  for (const f of getFiles(DATA_LEX_DIR, /\.json$/)) {
    try {
      const j = loadJson(f);
      if (!validateLex(j)) { ok = false; console.error(`❌ Invalid LEXICON: ${f}`); console.error(validateLex.errors); }
      else console.log(`✅ LEXICON ok: ${f}`);
    } catch (e) { ok = false; console.error(`❌ JSON parse error: ${f}`); console.error(String(e)); }
  }

  if (!ok) { console.error('VALIDATION_FAILED'); process.exit(1); }
  else { console.log('VALIDATOR_OK'); }
}

main();
