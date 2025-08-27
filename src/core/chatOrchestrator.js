// File: src/core/chatOrchestrator.js
import { normalizeRawInput } from "./symptomNormalizer.js";
import { loadRegistry } from "./conditionRegistry.js";
import { extractWithLLM } from "../api/gptTriageClient.js";

export function createChatOrchestrator({
  triageFn,
  nbqFn,
  onUpdate,
  onBotMessage,
  onTypingStart,
  onTypingStop,
}) {
  const state = {
    messages: [],
    featureSet: new Set(),
    modifiers: {},
    demographics: { idade: null, sexo: null, comorbidades: [] },
    areas: [],
    ranking: [],
    outputs: null,
    nbq: [],
    registry: null,
  };

  const ensureRegistry = async () => {
    if (!state.registry) state.registry = await loadRegistry();
    return state.registry;
  };

  const mergeFeatureSet = (incoming) => {
    if (!incoming) return;
    for (const f of incoming) state.featureSet.add(f);
  };
  const mergeModifiers = (mods) => {
    if (!mods) return;
    Object.assign(state.modifiers, mods);
  };
  const mergeDemographics = (dem) => {
    if (!dem) return;
    for (const k of ["idade", "sexo"]) {
      if (dem[k] !== undefined && dem[k] !== null) state.demographics[k] = dem[k];
    }
    if (Array.isArray(dem.comorbidades)) {
      state.demographics.comorbidades = dem.comorbidades;
    }
  };

  const runTriage = async () => {
    const raw = {
      symptoms: Array.from(state.featureSet),
      hpi: state.messages.filter((m) => m.role === "user").slice(-1)[0]?.text || "",
      idade: state.demographics.idade,
      sexo: state.demographics.sexo,
      comorbidades: state.demographics.comorbidades,
    };
    const out = await triageFn(raw, { mode: "gated" });
    state.areas = out.areas;
    state.ranking = out.ranking || [];
    state.outputs = out.outputs || null;

    // NBQ atualizado
    state.nbq = await nbqFn({
      areas: state.areas,
      ranking: state.ranking,
      featureSet: state.featureSet,
    });

    // Safety: red flags → via de emergência
    const via = state.outputs?.via || null;
    const alarmes = state.outputs?.alarmes || [];
    if (via && via.startsWith("emergencia")) {
      onBotMessage?.(
        `⚠️ Identificamos sinais de alerta que indicam **${via.replace("_", " ")}**. ` +
          `Motivo: ${state.outputs.via_reason || "critério clínico"}. ` +
          `Procure atendimento com prioridade.`,
      );
    }

    onUpdate?.(state);
  };

  const ingestUserText = async (text) => {
    state.messages.push({ role: "user", text });
    onTypingStart?.();

    const registry = await ensureRegistry();

    // LLM boost (pode retornar vazio; sem quebrar fluxo)
    const llm = await extractWithLLM(text, registry);

    // Extração local (sinônimos/lexicons)
    const local = await normalizeRawInput({ text }, registry);

    // Mescla evidências
    mergeFeatureSet(llm.features || []);
    mergeFeatureSet(local.featureSet);
    mergeModifiers({ ...(llm.modifiers || {}), ...(local.modifiers || {}) });
    mergeDemographics({ ...(llm.demographics || {}), ...(local.demographics || {}) });

    await runTriage();

    // Resposta curta do bot
    const top =
      state.ranking?.[0]?.global_id
        ? registry.byGlobalId[state.ranking[0].global_id]?.entries?.[0]?.label ||
          state.ranking[0].global_id
        : "sem hipótese predominante";
    const via = state.outputs?.via || "—";
    const alarmes = state.outputs?.alarmes || [];
    const alarmTxt = alarmes.length ? ` | Alarmes: ${alarmes.join(", ")}` : "";
    onBotMessage?.(`Entendi. Topo atual: **${top}** | Via sugerida: **${via}**${alarmTxt}.`);

    // Pergunta NBQ direta (se houver)
    if (Array.isArray(state.nbq) && state.nbq.length) {
      onBotMessage?.(`Pergunta: ${state.nbq[0].question}`);
    }

    onTypingStop?.();
  };

  const ingestNBQAnswer = async ({ featureId, kind, value }) => {
    onTypingStart?.();

    if (kind === "boolean") {
      if (value === true) state.featureSet.add(featureId);
      // se precisar registrar negação, isso seria parte de um design futuro
    } else if (kind === "number") {
      state.modifiers[featureId] = Number(value);
    } else if (kind === "categorical") {
      if (value?.featureId) state.featureSet.add(value.featureId);
      else state.modifiers[featureId] = value?.value ?? value;
    }

    await runTriage();

    const next = state.nbq?.[0]?.question;
    if (next) onBotMessage?.(`Certo. Próxima: ${next}`);

    onTypingStop?.();
  };

  return {
    state,
    ingestUserText,
    ingestNBQAnswer,
  };
}
