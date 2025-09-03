// File: src/pages/triageChat.js
import { createChatUI } from "../ui/robottoChat.js";
import { createChatOrchestrator } from "../core/chatOrchestrator.js";
import { triage } from "../core/triageEngine.js";
import { suggestNBQ } from "../core/nbq.js";
import { renderResultados } from "../ui/resultadoRenderer.js";
import { exportReport } from "../api/reportExportClient.js";

let __lastState = null;
let __lastUserMsg = "";

(function main() {
  const $ = (id) => document.getElementById(id);

  // Instancia UI do chat
  const ui = createChatUI({
    messagesEl: $("messages"),
    summaryEl: $("summary"),
    quickEl: $("quick"),
    inputEl: $("input"),
    sendEl: $("send"),
  });

  // Tema (light/dark) com persistência
  initThemeToggle();

  // Orquestrador da conversa
  const orch = createChatOrchestrator({
    triageFn: triage,
    nbqFn: suggestNBQ,

    // Atualização de estado após cada triagem
    onUpdate: (state) => {
      __lastState = state;

      // Resumo (se a UI expuser setSummary)
      if (typeof ui.setSummary === "function") {
        try {
          const resumo = state?.outputs?.resumo
            ? `<pre class="resumo-block">${escapeHTML(JSON.stringify(state.outputs.resumo, null, 2))}</pre>`
            : "";
          ui.setSummary(resumo);
        } catch {}
      }

      // Quick Actions a partir das NBQs
      if (typeof ui.setQuickActions === "function") {
        const nbq = Array.isArray(state?.outputs?.next_questions)
          ? state.outputs.next_questions.map((q) => ({
              // Texto do botão
              label: q.question || (state.registry?.featuresMap?.[q.featureId]?.label ?? q.featureId),
              // Payload especial para diferenciar de uma mensagem textual do usuário
              payload: { __nbq: true, featureId: q.featureId, value: true },
            }))
          : [];
        ui.setQuickActions(nbq);
      }

      // Painel de resultados (coluna direita)
      const pane = $("resultPane");
      if (pane) {
        renderResultados({
          container: pane,
          outputs: state.outputs,
          ranking: state.ranking,
          registry: state.registry,
        });
      }
    },

    // Mensagem do bot para o histórico
    onBotMessage: (text) => ui.addMessage("bot", text),

    // Estados de "digitando…"
    onTypingStart: () => {
      if (typeof ui.setThinking === "function") ui.setThinking(true);
    },
    onTypingStop: () => {
      if (typeof ui.setThinking === "function") ui.setThinking(false);
    },
  });

  // Handler ÚNICO de envio do usuário (texto OU quick action)
  ui.onUserSend(async (input) => {
    // Se veio do teclado, é string; se veio de quick action, é nosso payload {__nbq:true,...}
    const isNBQ = input && typeof input === "object" && input.__nbq === true;

    if (isNBQ) {
      // Quick action NBQ
      const answer = { featureId: input.featureId, value: input.value === undefined ? true : input.value };
      if (typeof ui.setThinking === "function") ui.setThinking(true);
      await orch.ingestNBQAnswer(answer);
      if (typeof ui.setThinking === "function") ui.setThinking(false);
      return;
    }

    // Texto livre (mensagem do usuário)
    const text = String(input || "").trim();
    if (!text) return;

    __lastUserMsg = text;
    ui.addMessage("user", text);

    if (typeof ui.setThinking === "function") ui.setThinking(true);
    await orch.ingestUserText(text);
    if (typeof ui.setThinking === "function") ui.setThinking(false);
  });

  // Atalho ↑ para recuperar última mensagem do usuário quando o input estiver vazio
  const inputEl = $("input");
  if (inputEl) {
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && inputEl.value.trim() === "" && __lastUserMsg) {
        inputEl.value = __lastUserMsg;
        setTimeout(() => {
          inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
        }, 0);
        e.preventDefault();
      }
    });
  }

  // Exportar relatório (HTML/MD)
  const btnExport = $("btnExportar");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      if (!__lastState) {
        alert("Nenhum caso para exportar ainda.");
        return;
      }
      const rawInput =
        __lastState.rawInput ||
        { hpi: __lastUserMsg || (Array.isArray(__lastState?.intake) ? __lastState.intake.join(", ") : "") };

      exportReport({
        rawInput,
        outputs: __lastState.outputs,
        ranking: __lastState.ranking,
      });
    });
  }

  // Mensagem inicial
  ui.addMessage(
    "bot",
    'Olá! Sou o ROBOTTINEK (OTTO). Pode me contar sua queixa principal? (ex.: "há 2 dias dor de ouvido à direita e febre")'
  );

  /* ---------------- Helpers ---------------- */
  function initThemeToggle() {
    const root = document.documentElement;
    const btn = $("themeToggle");
    const KEY = "robotto_theme";
    // prioridade: localStorage → preferência do SO → dark
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") {
      root.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      root.setAttribute("data-theme", "light");
    } else {
      root.setAttribute("data-theme", "dark");
    }
    if (btn) {
      btn.addEventListener("click", () => {
        const curr = root.getAttribute("data-theme") === "light" ? "dark" : "light";
        root.setAttribute("data-theme", curr);
        localStorage.setItem(KEY, curr);
      });
    }
  }

  function escapeHTML(str) {
    return String(str).replace(/[<&>"']/g, (ch) => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }
})();
