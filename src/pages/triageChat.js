// File: src/pages/triageChat.js
import { createChatUI } from "../ui/robottoChat.js";
import { createChatOrchestrator } from "../core/chatOrchestrator.js";
import { triage } from "../core/triageEngine.js";
import { suggestNBQ } from "../core/nbq.js";
import { renderResultados } from "../ui/resultadoRenderer.js";
import { exportReport } from "../api/reportExportClient.js";

let __lastState = null;

(function main() {
  // Acessibilidade: ano no rodapé
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Tema
  initThemeToggle();

  // Monta UI do chat
  const ui = createChatUI({
    messagesEl: document.getElementById("messages"),
    summaryEl: document.getElementById("summary"),
    quickEl: document.getElementById("quick"),
    inputEl: document.getElementById("input"),
    sendEl: document.getElementById("send"),
  });

  // Orquestrador
  const orch = createChatOrchestrator({
    triageFn: triage,
    nbqFn: suggestNBQ,
    onUpdate: (state) => {
      __lastState = state;

      // Atualiza mini resumo e quick (chips NBQ)
      ui.renderSummary(state);
      ui.renderQuickReplies(state);

      // Renderiza painel de resultados
      const pane = document.getElementById("resultPane");
      renderResultados({
        container: pane,
        outputs: state.outputs,
        ranking: state.ranking,
        registry: state.registry, // se o orchestrator expõe; se não, função faz fallback seguro
      });
    },
    onBotMessage: (text) => ui.addMessage("bot", text),
    onTypingStart: () => ui.showTyping(true),
    onTypingStop: () => ui.showTyping(false),
  });

  // Enviar texto
  let lastUserMsg = "";
  ui.onSend(async (text) => {
    lastUserMsg = text;
    ui.addMessage("user", text);
    ui.showTyping(true);
    try {
      await orch.ingestUserText(text);
    } finally {
      ui.showTyping(false);
    }
  });

  // Quick (NBQ)
  ui.onQuick(async (answer) => {
    ui.showTyping(true);
    try {
      await orch.ingestNBQAnswer(answer);
    } finally {
      ui.showTyping(false);
    }
  });

  // Atalho: seta ↑ recupera última mensagem
  const inputEl = document.getElementById("input");
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && inputEl.value.trim() === "" && lastUserMsg) {
      inputEl.value = lastUserMsg;
      setTimeout(() => {
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      }, 0);
      e.preventDefault();
    }
  });

  // Exportar relatório (MD/HTML)
  const btnExport = document.getElementById("btnExportar");
  btnExport?.addEventListener("click", () => {
    if (!__lastState) return;
    const rawInput = {
      hpi: __lastState?.raw?.text || __lastState?.raw?.hpi || "",
      idade: __lastState?.raw?.idade ?? null,
      sexo: __lastState?.raw?.sexo ?? null,
      nome: __lastState?.raw?.nome ?? null,
    };
    exportReport({
      rawInput,
      outputs: __lastState.outputs,
      ranking: __lastState.ranking,
    });
  });

  // Mensagem inicial
  ui.addMessage(
    "bot",
    'Olá! Sou o ROBOTTINEK (OTTO). Pode me contar sua queixa principal? (ex.: "há 2 dias dor de ouvido à direita e febre")'
  );

  /* -------- Helpers -------- */
  function initThemeToggle() {
    const root = document.documentElement;
    const btn = document.getElementById("themeToggle");
    const KEY = "robotto_theme";
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") {
      root.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      root.setAttribute("data-theme", "light");
    } else {
      root.setAttribute("data-theme", "dark");
    }
    btn?.addEventListener("click", () => {
      const curr = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", curr);
      localStorage.setItem(KEY, curr);
    });
  }
})();
