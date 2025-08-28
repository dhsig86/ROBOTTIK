// ROBOTTO front — chama o backend /api/triage (LLM boost + fallback local)
// Mantém contrato: extractWithLLM(text, registry) → { features, modifiers, demographics }

import { getEnv } from "../compat/robottoShim.js";

/**
 * Extrai features/modifiers/demographics via backend.
 * @param {string} text  Texto livre do usuário
 * @param {object} registry  Resultado de loadRegistry() (de onde pegamos o universo de features)
 * @returns {Promise<{features:string[], modifiers:Object, demographics:Object}>}
 */
export async function extractWithLLM(text, registry) {
  try {
    const env = await getEnv();
    // Se LLM desligado ou sem backend configurado → não faz chamada
    if (!env || env.LLM_PROVIDER !== "on" || !env.TRIAGE_API_BASE) {
      return { features: [], modifiers: {}, demographics: {} };
    }

    // Universo permitido de features (IDs canônicos) vem do registry do front
    const featuresMap =
      (registry && registry.featuresMap && Object.keys(registry.featuresMap)) ||
      (registry && registry.byFeatureId && Object.keys(registry.byFeatureId)) ||
      [];

    const url = `${env.TRIAGE_API_BASE.replace(/\/+$/, "")}/api/triage`;
    const body = {
      text: String(text || ""),
      want: "extract",
      featuresMap // restringe o LLM/fallback do backend ao que o front conhece
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // CORS já está liberado no backend via ALLOW_ORIGINS
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      // Não explode: retorna vazio e deixa o normalizer local seguir o fluxo
      return { features: [], modifiers: {}, demographics: {} };
    }
    const data = await res.json();

    // Sanitiza tipos básicos
    const out = {
      features: Array.isArray(data.features) ? data.features : [],
      modifiers: data.modifiers && typeof data.modifiers === "object" ? data.modifiers : {},
      demographics: data.demographics && typeof data.demographics === "object" ? data.demographics : {}
    };
    return out;
  } catch {
    // Qualquer erro → fallback no orquestrador continuará via normalizer local
    return { features: [], modifiers: {}, demographics: {} };
  }
}

export default { extractWithLLM };
