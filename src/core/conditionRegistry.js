/* File: src/core/conditionRegistry.js
 * Carrega e indexa todas as regras clínicas por área, além dos features canônicos.
 * - byArea[area]: { area, intake, dx, profiles, via_atendimento }
 * - byGlobalId[global_id]: { global_id, entries: [{ area, id, label, pretest, criteria, heuristics, red_flags }], pretest_global, areas }
 * - byLocalId[area.localId]: referencia rápida para o item local
 * - featuresMap[id]: { id, label, aliases[] }
 */

const REGISTRY_CACHE = {
  loaded: false,
  byArea: null,
  byGlobalId: null,
  byLocalId: null,
  featuresMap: null,
  areas: ["ouvido", "nariz", "garganta", "pescoco"],
};

function basePath() {
  // Permite usar em GitHub Pages ou local — caminhos relativos a partir da raiz do app
  return "";
}

async function fetchJSON(path) {
  const url = basePath() + path.replace(/^\/*/, "/"); // garante uma / no começo
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`Falha ao carregar ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function loadArea(area) {
  const diag = await fetchJSON(`/src/engines/${area}/diag_${area}.json`);
  const profiles = await fetchJSON(`/src/engines/${area}/profiles_${area}.json`).catch(() => ({}));
  return {
    area,
    intake: diag.intake || { symptoms: [], modifiers: [] },
    dx: Array.isArray(diag.dx) ? diag.dx : [],
    profiles: profiles || {},
    via_atendimento: diag.via_atendimento || {},
  };
}

function computeGlobalPretest(entries) {
  // Média simples dos pretests locais (poderemos ponderar por qualidade/área futuramente)
  if (!entries.length) return 0.01;
  const sum = entries.reduce((acc, e) => acc + (typeof e.pretest === "number" ? e.pretest : 0), 0);
  return Math.max(0, Math.min(1, sum / entries.length));
}

export async function loadRegistry({ force = false } = {}) {
  if (REGISTRY_CACHE.loaded && !force) {
    return {
      byArea: REGISTRY_CACHE.byArea,
      byGlobalId: REGISTRY_CACHE.byGlobalId,
      byLocalId: REGISTRY_CACHE.byLocalId,
      featuresMap: REGISTRY_CACHE.featuresMap,
      areas: REGISTRY_CACHE.areas.slice(),
    };
  }

  // 1) Carrega features globais
  const features = await fetchJSON(`/src/data/global/features.json`);
  const featuresMap = Object.create(null);
  for (const f of features.features || []) {
    if (!f || !f.id) continue;
    featuresMap[f.id] = { id: f.id, label: f.label || f.id, aliases: f.aliases || [] };
  }

  // 2) Carrega dados por área
  const byArea = Object.create(null);
  for (const area of REGISTRY_CACHE.areas) {
    byArea[area] = await loadArea(area);
  }

  // 3) Indexações cruzadas
  const byGlobalId = Object.create(null);
  const byLocalId = Object.create(null);

  for (const area of REGISTRY_CACHE.areas) {
    const bundle = byArea[area];
    for (const d of bundle.dx) {
      const localId = d.id;
      const global_id = d.global_id || localId;
      const entry = {
        area,
        id: localId,
        global_id,
        label: d.label || localId,
        pretest: typeof d.pretest === "number" ? d.pretest : 0.01,
        criteria: Array.isArray(d.criteria) ? d.criteria : [],
        heuristics: Array.isArray(d.heuristics) ? d.heuristics : [],
        red_flags: Array.isArray(d.red_flags) ? d.red_flags : [],
        tags: Array.isArray(d.tags) ? d.tags : [],
      };

      // byLocalId
      byLocalId[`${area}.${localId}`] = entry;

      // byGlobalId
      if (!byGlobalId[global_id]) {
        byGlobalId[global_id] = { global_id, entries: [], pretest_global: 0.01, areas: new Set() };
      }
      byGlobalId[global_id].entries.push(entry);
      byGlobalId[global_id].areas.add(area);
    }
  }

  // Finaliza pretest_global e normaliza sets
  for (const gid of Object.keys(byGlobalId)) {
    const block = byGlobalId[gid];
    block.pretest_global = computeGlobalPretest(block.entries);
    block.areas = Array.from(block.areas);
  }

  // 4) Atualiza cache e retorna
  REGISTRY_CACHE.loaded = true;
  REGISTRY_CACHE.byArea = byArea;
  REGISTRY_CACHE.byGlobalId = byGlobalId;
  REGISTRY_CACHE.byLocalId = byLocalId;
  REGISTRY_CACHE.featuresMap = featuresMap;

  return {
    byArea,
    byGlobalId,
    byLocalId,
    featuresMap,
    areas: REGISTRY_CACHE.areas.slice(),
  };
}
