/* File: src/core/symptomNormalizer.js
 * Normaliza texto livre e seleções para IDs canônicos de features.
 * - Usa features globais (labels + aliases) do registry.featuresMap
 * - (Opcional) Mescla léxicos por área em /src/data/lexicons/*.lex.json, se presentes
 * - Gera matches por unigrama/bigrama/trigrama sobre texto normalizado
 * - Extrai modificadores simples (ex.: "duracao_dias" a partir do HPI)
 */

const SYM_CACHE = {
  builtFor: null, // registry instance usado
  index: null, // Map<string(alias_normalizado) -> featureId>
  revIndex: null, // Map<featureId -> Set<alias>>
  loadedLexicons: false,
};

/** Normalização básica (remove acentos, caixa, pontuação redundante) */
export function normStr(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_\. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokeniza em palavras simples (sem stopwords curtas) */
function tokenize(text) {
  const toks = normStr(text).split(" ").filter(Boolean);
  return toks.filter((t) => t.length >= 2);
}

/** Gera n-gramas (n=1..3) contíguos */
function makeNgrams(tokens, nMin = 1, nMax = 3) {
  const grams = [];
  for (let n = nMin; n <= nMax; n++) {
    for (let i = 0; i <= tokens.length - n; i++) {
      grams.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return grams;
}

/** Carrega léxicos por área, se existirem, e mescla no índice */
async function maybeLoadLexiconsInto(indexMap, revMap) {
  if (SYM_CACHE.loadedLexicons) return;
  const files = [
    "/src/data/lexicons/ouvido.lex.json",
    "/src/data/lexicons/nariz.lex.json",
    "/src/data/lexicons/garganta.lex.json",
    "/src/data/lexicons/pescoco.lex.json",
  ];
  const tryFetch = async (path) => {
    try {
      const res = await fetch(path, { cache: "no-cache" });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  for (const f of files) {
    const data = await tryFetch(f);
    if (!data) continue;

    // Tentamos reconhecer formatos comuns de léxico sem “quebrar” se mudar.
    // Exemplos aceitos:
    // 1) { "entries": [ { "alias": "nariz entupido", "id": "obstrucao_nasal" }, ... ] }
    // 2) { "map": { "nariz entupido": "obstrucao_nasal", ... } }
    // 3) { "synonyms": [ { "term": "nariz entupido", "feature_id": "obstrucao_nasal" }, ... ] }
    if (Array.isArray(data.entries)) {
      for (const e of data.entries) {
        const alias = normStr(e.alias || e.term || e.text || "");
        const fid = e.id || e.feature_id || e.feature || e.featureId;
        if (!alias || !fid) continue;
        indexMap.set(alias, fid);
        if (!revMap.has(fid)) revMap.set(fid, new Set());
        revMap.get(fid).add(alias);
      }
    } else if (data.map && typeof data.map === "object") {
      for (const [k, v] of Object.entries(data.map)) {
        const alias = normStr(k);
        const fid = v;
        if (!alias || !fid) continue;
        indexMap.set(alias, fid);
        if (!revMap.has(fid)) revMap.set(fid, new Set());
        revMap.get(fid).add(alias);
      }
    } else if (Array.isArray(data.synonyms)) {
      for (const s of data.synonyms) {
        const alias = normStr(s.term || s.alias || "");
        const fid = s.feature_id || s.id || s.feature;
        if (!alias || !fid) continue;
        indexMap.set(alias, fid);
        if (!revMap.has(fid)) revMap.set(fid, new Set());
        revMap.get(fid).add(alias);
      }
    }
  }
  SYM_CACHE.loadedLexicons = true;
}

/** Constrói (e cacheia) o índice alias->feature a partir do registry */
async function ensureIndex(registry) {
  if (SYM_CACHE.index && SYM_CACHE.builtFor === registry) {
    return { index: SYM_CACHE.index, revIndex: SYM_CACHE.revIndex };
  }

  const idx = new Map();
  const rev = new Map();

  // 1) features globais (labels + aliases)
  for (const [fid, feat] of Object.entries(registry?.featuresMap || {})) {
    const label = normStr(feat.label || fid);
    if (label) {
      idx.set(label, fid);
      if (!rev.has(fid)) rev.set(fid, new Set());
      rev.get(fid).add(label);
    }
    const aliases = Array.isArray(feat.aliases) ? feat.aliases : [];
    for (const a of aliases) {
      const na = normStr(a);
      if (!na) continue;
      idx.set(na, fid);
      if (!rev.has(fid)) rev.set(fid, new Set());
      rev.get(fid).add(na);
    }
  }

  // 2) léxicos específicos por área (opcional, tolerante ao formato)
  await maybeLoadLexiconsInto(idx, rev);

  SYM_CACHE.builtFor = registry;
  SYM_CACHE.index = idx;
  SYM_CACHE.revIndex = rev;
  return { index: idx, revIndex: rev };
}

/** Procura matches de alias no texto (via n-gramas) e retorna Set de featureIds */
export async function normalizeTextToFeatures(
  text,
  registry,
  { nMax = 3 } = {},
) {
  if (!text) return new Set();
  const { index } = await ensureIndex(registry);
  const toks = tokenize(text);
  const grams = makeNgrams(toks, 1, nMax);

  const found = new Set();
  for (const g of grams) {
    const fid = index.get(g);
    if (fid) found.add(fid);
  }
  return found;
}

/** Extrai modificadores simples (MVP: duração em dias) a partir do texto */
export function extractModifiersFromText(text) {
  const mods = {};
  if (!text) return mods;

  const t = normStr(text);

  // “há 3 dias”, “3 dias”, “2 semanas”, “1 mes”, “4 horas”
  // convertemos tudo para duracao_dias (aproximações conservadoras)
  const re =
    /(?:ha\s+)?(\d{1,3})\s*(dia|dias|semana|semanas|mes|meses|hora|horas)\b/gi;
  let m;
  let bestDays = null;
  while ((m = re.exec(t))) {
    const num = parseInt(m[1], 10);
    const unit = m[2];
    if (!Number.isFinite(num) || num <= 0) continue;

    let days = null;
    if (unit.startsWith("dia")) days = num;
    else if (unit.startsWith("semana")) days = num * 7;
    else if (unit.startsWith("mes")) days = num * 30;
    else if (unit.startsWith("hora")) days = Math.max(1, Math.round(num / 24));

    if (days !== null) {
      bestDays = bestDays === null ? days : Math.max(bestDays, days);
    }
  }
  if (bestDays !== null) mods.duracao_dias = bestDays;

  return mods;
}

/**
 * Normaliza a entrada bruta do usuário:
 * - Mapeia seleção de sintomas + texto livre → Set<featureId>
 * - Extrai modificadores simples (ex.: duracao_dias)
 * - Preserva campos demográficos (idade/sexo) sem transformar
 */
export async function normalizeRawInput(raw = {}, registry) {
  const featureSet = new Set();

  // 1) IDs já canônicos (checkboxes/seleções)
  const selected = Array.isArray(raw?.symptoms) ? raw.symptoms : [];
  for (const maybeId of selected) {
    const id = normStr(maybeId);
    if (registry?.featuresMap?.[id]) featureSet.add(id);
  }

  // 2) Texto livre → features (aliases/labels/lexicons)
  const freeText = [raw?.text, raw?.queixa, raw?.hpi, raw?.observacoes]
    .filter(Boolean)
    .join(" ");
  if (freeText) {
    const setFromText = await normalizeTextToFeatures(freeText, registry);
    for (const f of setFromText) featureSet.add(f);
  }

  // 3) Modificadores
  const modifiers = {
    ...extractModifiersFromText(freeText),
  };

  // 4) Retorna estrutura canônica
  return {
    featureSet,
    modifiers,
    demographics: {
      idade: raw?.idade ?? null,
      sexo: raw?.sexo ?? null,
      comorbidades: Array.isArray(raw?.comorbidades) ? raw.comorbidades : [],
    },
  };
}
