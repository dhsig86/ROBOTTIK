/* File: src/core/adjustClinico.js
 * Deriva perfis clínicos a partir de idade/sexo/comorbidades e expõe utilitários
 * para (no próximo patch) aplicarmos multiplicadores no blend.
 *
 * Perfis (MVP):
 *  - crianca   (<12)
 *  - adolescente (12–17)
 *  - adulto    (18–64)
 *  - idoso     (>=65)
 *  - gestante  (se comorbidades inclui 'gestante' ou raw.gestante === true)
 *  - imunossuprimido (comorbidades contém termos chave)
 */

export function faixaEtaria(idade) {
  const n = Number(idade);
  if (!Number.isFinite(n) || n < 0) return "desconhecida";
  if (n < 12) return "crianca";
  if (n < 18) return "adolescente";
  if (n < 65) return "adulto";
  return "idoso";
}

function hasToken(list = [], needles = []) {
  const S = new Set((list || []).map((x) => String(x || "").toLowerCase()));
  for (const n of needles) if (S.has(String(n).toLowerCase())) return true;
  return false;
}

/** Extrai demografia/comorbidades já normalizadas do raw */
export function extractDemographics(raw = {}) {
  const idade = raw?.idade ?? null;
  const sexo = raw?.sexo ?? null; // "M" | "F" | null
  const comorbidades = Array.isArray(raw?.comorbidades) ? raw.comorbidades : [];
  const gestante =
    !!raw?.gestante ||
    hasToken(comorbidades, ["gestante", "gravidez", "grávida"]);
  return { idade, sexo, comorbidades, gestante };
}

/** Deriva um Set de perfis a partir de demografia */
export function deriveProfiles({
  idade,
  sexo,
  comorbidades = [],
  gestante = false,
} = {}) {
  const profiles = new Set();

  // idade → faixa etária
  const fe = faixaEtaria(idade);
  if (fe !== "desconhecida") profiles.add(fe);

  // sexo/gestação
  if (String(sexo || "").toUpperCase() === "F" && gestante)
    profiles.add("gestante");

  // imunossupressão (heurística de termos)
  const imunokeys = [
    "imunossuprimido",
    "hiv",
    "aids",
    "quimioterapia",
    "corticoide_cronico",
    "transplante",
    "neoplasia_ativa",
    "imunodeficiencia",
  ];
  if (hasToken(comorbidades, imunokeys)) profiles.add("imunossuprimido");

  // alérgico (pode influenciar recomendações)
  if (
    hasToken(comorbidades, ["alergico", "alérgico", "asma", "rinite_alergica"])
  ) {
    profiles.add("alergico");
  }

  // tabagista/etilista (para garganta/cabeça-pescoço)
  if (hasToken(comorbidades, ["tabagista", "fumante"]))
    profiles.add("tabagista");
  if (hasToken(comorbidades, ["etilista", "alcool", "álcool"]))
    profiles.add("etilista");

  return profiles;
}

/**
 * (Opcional) Calcula multiplicador sugerido para um diagnóstico local
 * com base em perfis e nos "profiles_<area>.json" (se definidos).
 *
 * Espera-se (se existir) estrutura aproximada em registry.byArea[area].profiles:
 * {
 *   "multipliers": {
 *     "<dx_local_id>": { "crianca": 1.2, "idoso": 0.9, ... },
 *     "@tags:infecção": { "imunossuprimido": 1.3 }
 *   }
 * }
 *
 * Esta função é tolerante: se não houver nada, retorna 1.0.
 */
export function profileMultiplierForDx({
  area,
  dxLocalId,
  dxTags = [],
  profilesSet,
  registry,
}) {
  const areaProfiles = registry?.byArea?.[area]?.profiles;
  if (!areaProfiles || typeof areaProfiles !== "object") return 1.0;

  const table = areaProfiles.multipliers || areaProfiles.multiplicadores || {};
  let mult = 1.0;

  const apply = (obj) => {
    for (const p of profilesSet) {
      const m = Number(obj[p]);
      if (Number.isFinite(m) && m > 0) {
        mult *= m;
      }
    }
  };

  // 1) Regras específicas por dx id
  if (table[dxLocalId]) apply(table[dxLocalId]);

  // 2) Regras por tag (chaves iniciadas por "@tags:")
  for (const [k, v] of Object.entries(table)) {
    if (!k.startsWith("@tags:")) continue;
    const tag = k.slice(6);
    if (dxTags.includes(tag)) apply(v);
  }

  return mult;
}

/** Resumo legível dos perfis (para UI/log/debug) */
export function summarizeProfiles(set) {
  if (!(set instanceof Set) || set.size === 0) return "sem perfis";
  return Array.from(set).join(", ");
}
// --- END FILE ---
