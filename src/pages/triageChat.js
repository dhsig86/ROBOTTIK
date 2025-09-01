// File: src/pages/chat.js
import { createChatUI } from "../ui/robottoChat.js";
import { createChatOrchestrator } from "../core/chatOrchestrator.js";
import { triage } from "../core/triageEngine.js";
import { suggestNBQ } from "../core/nbq.js";

(function main() {
  const ui = createChatUI({
    messagesEl: document.getElementById("messages"),
    summaryEl: document.getElementById("summary"),
    quickEl: document.getElementById("quick"),
    inputEl: document.getElementById("input"),
    sendEl: document.getElementById("send"),
  });

  // Tema: inicializa e toggle
  initThemeToggle();

  const orch = createChatOrchestrator({
    triageFn: triage,
    nbqFn: suggestNBQ,
    onUpdate: (state) => {
      ui.renderSummary(state);
      ui.renderQuickReplies(state);
    },
    onBotMessage: (text) => ui.addMessage("bot", text),
    // Estados de "pensando"/carregando
    onTypingStart: () => ui.showTyping(true),
    onTypingStop: () => ui.showTyping(false),
  });

  // Quick replies (NBQ)
  ui.onQuick(async (answer) => {
    ui.showTyping(true);
    await orch.ingestNBQAnswer(answer);
    ui.showTyping(false);
  });

  // Envio de texto + atalho ↑ para editar última mensagem
  let lastUserMsg = "";
  ui.onSend(async (text) => {
    lastUserMsg = text;
    ui.addMessage("user", text);
    ui.showTyping(true);
    await orch.ingestUserText(text);
    ui.showTyping(false);
  });

  // Atalho: ↑ para recuperar última mensagem do usuário quando o input estiver vazio
  const inputEl = document.getElementById("input");
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && inputEl.value.trim() === "" && lastUserMsg) {
      inputEl.value = lastUserMsg;
      // Coloca o cursor ao final
      setTimeout(() => {
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      }, 0);
      e.preventDefault();
    }
  });

  // Mensagem inicial
  ui.addMessage(
    "bot",
    'Olá! Sou o ROBOTTINEK. Pode me chamar de OTTO. Pode me contar sua queixa principal? (ex.: "há 2 dias dor de ouvido à direita e febre")',
  );

  /* -------- Helpers -------- */
  function initThemeToggle() {
    const root = document.documentElement;
    const btn = document.getElementById("themeToggle");
    const KEY = "robotto_theme";
    // prioridade: localStorage → preferência do SO (prefers-color-scheme) → dark
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") {
      root.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      root.setAttribute("data-theme", "light");
    } else {
      root.setAttribute("data-theme", "dark");
    }

    btn.addEventListener("click", () => {
      const curr = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", curr);
      localStorage.setItem(KEY, curr);
    });
  }
})();
