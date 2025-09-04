// File: src/ui/robottoChat.js
// UI mínima porém completa: histórico, estado "digitando", quick (NBQ), input e envio.

export function createChatUI({ messagesEl, summaryEl, quickEl, inputEl, sendEl }) {
  // Fallback defensivo: se algum elemento não existir, cria
  const chatRoot = document.querySelector(".chat");

  if (!summaryEl) {
    summaryEl = document.createElement("div");
    summaryEl.id = "summary";
    summaryEl.className = "summary";
    summaryEl.textContent = "Descreva sua queixa na caixa abaixo.";
    chatRoot?.insertBefore(summaryEl, chatRoot.firstChild);
  }

  if (!messagesEl) {
    messagesEl = document.createElement("div");
    messagesEl.id = "messages";
    messagesEl.className = "messages";
    chatRoot?.appendChild(messagesEl);
  }

  if (!quickEl) {
    quickEl = document.createElement("div");
    quickEl.id = "quick";
    quickEl.className = "quick";
    chatRoot?.appendChild(quickEl);
  }

  if (!inputEl || !sendEl) {
    let composer = chatRoot?.querySelector(".composer");
    if (!composer) {
      composer = document.createElement("div");
      composer.className = "composer";
      chatRoot?.appendChild(composer);
    }
    if (!inputEl) {
      inputEl = document.createElement("textarea");
      inputEl.id = "input";
      inputEl.className = "input";
      inputEl.rows = 2;
      inputEl.placeholder = "Descreva sua queixa...";
      composer.appendChild(inputEl);
    }
    if (!sendEl) {
      sendEl = document.createElement("button");
      sendEl.id = "send";
      sendEl.className = "button send";
      sendEl.textContent = "Enviar";
      composer.appendChild(sendEl);
    }
  }

  // Estado "digitando..."
  let typingEl = null;
  function showTyping(on) {
    if (!messagesEl) return;
    if (on) {
      if (!typingEl) {
        typingEl = document.createElement("div");
        typingEl.className = "msg bot";
        typingEl.innerHTML = `<span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
      }
      if (!typingEl.isConnected) {
        messagesEl.appendChild(typingEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    } else if (typingEl?.isConnected) {
      typingEl.remove();
    }
  }

  // Render de mensagens
  function addMessage(who, text) {
    if (!messagesEl) return;
    if (typingEl?.isConnected) typingEl.remove();

    const el = document.createElement("div");
    el.className = `msg ${who === "user" ? "user" : "bot"}`;
    el.textContent = String(text ?? "");
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // Resumo rápido (top-1, via, alarmes)
  function renderSummary(state) {
    if (!summaryEl) return;
    try {
      const via = state?.outputs?.via || "ambulatorio_rotina";
      const top = Array.isArray(state?.ranking) && state.ranking[0];
      const pct = Math.round((top?.posterior || 0) * 100);
      const name =
        state?.registry?.byGlobalId?.[top?.global_id]?.entries?.[0]?.label ||
        top?.global_id ||
        "—";
      const alarmes = Array.isArray(state?.outputs?.alarmes) ? state.outputs.alarmes : [];
      summaryEl.innerHTML = `
        <div class="kv">
          <div class="row"><strong>Via:</strong> <span>${via}</span></div>
          <div class="row"><strong>Top-1:</strong> <span>${name} (${pct}%)</span></div>
          <div class="row"><strong>Alarmes:</strong> <span>${alarmes.join(", ") || "—"}</span></div>
        </div>
      `;
    } catch {
      summaryEl.textContent = "Atualizando…";
    }
  }

  // Quick replies / NBQ chips
  let quickHandler = null;
  function renderQuickReplies(state) {
    if (!quickEl) return;
    quickEl.innerHTML = "";
    const nbq = state?.outputs?.next_questions || state?.nbq || [];
    if (!Array.isArray(nbq) || nbq.length === 0) return;

    nbq.forEach((q) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = q?.question || `Confirmar: ${q?.featureId}`;
      chip.dataset.featureId = q?.featureId || "";
      chip.addEventListener("click", () => {
        if (typeof quickHandler === "function") {
          const answer = { featureId: q.featureId, value: true, question: q.question };
          quickHandler(answer);
        }
      });
      quickEl.appendChild(chip);
    });
  }

  // Envio
  let sendHandler = null;
  sendEl?.addEventListener("click", () => {
    const text = (inputEl?.value || "").trim();
    if (!text) return;
    sendHandler?.(text);
    inputEl.value = "";
    inputEl.focus();
  });
  inputEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendEl?.click();
    }
  });

  return {
    addMessage,
    showTyping,
    renderSummary,
    renderQuickReplies,
    onSend(fn) { sendHandler = fn; },
    onQuick(fn) { quickHandler = fn; },
  };
}
