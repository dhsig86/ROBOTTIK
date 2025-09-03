// src/ui/robottoChat.js
// UI mínima do chat: histórico de mensagens, quick actions, “digitando…”, input/botão.
// Acessível: aria-live, foco por teclado, e scroll automático.

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function sanitize(str) {
  return String(str ?? "").replace(/[<&>"']/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

export function createChatUI({ messagesEl, summaryEl, quickEl, inputEl, sendEl }) {
  if (!messagesEl || !inputEl || !sendEl) {
    throw new Error("createChatUI: elementos obrigatórios ausentes.");
  }

  // Região ao vivo p/ leitores de tela
  messagesEl.setAttribute("aria-live", "polite");
  messagesEl.setAttribute("aria-relevant", "additions");

  let onSend = null;
  let typingEl = null;

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderBubble(role, text) {
    const row = el("div", `msg-row ${role}`);
    const bubble = el("div", `msg-bubble ${role}`);
    bubble.innerHTML = sanitize(text);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    scrollToBottom();
  }

  function addMessage(role, text) {
    renderBubble(role, text);
  }

  function setThinking(isOn) {
    if (isOn) {
      if (typingEl) return;
      typingEl = el("div", "msg-row bot");
      const b = el("div", "msg-bubble bot typing");
      b.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      typingEl.appendChild(b);
      messagesEl.appendChild(typingEl);
      scrollToBottom();
    } else if (typingEl) {
      typingEl.remove();
      typingEl = null;
    }
  }

  function setSummary(html) {
    if (!summaryEl) return;
    summaryEl.innerHTML = html || "";
  }

  function setQuickActions(list) {
    if (!quickEl) return;
    quickEl.innerHTML = "";
    if (!Array.isArray(list) || list.length === 0) {
      quickEl.classList.add("hidden");
      return;
    }
    quickEl.classList.remove("hidden");
    list.forEach((item) => {
      const btn = el("button", "quick-btn", item?.label || item?.text || "Enviar");
      btn.type = "button";
      btn.addEventListener("click", () => {
        if (onSend) onSend(item?.payload || item?.text || btn.textContent);
      });
      quickEl.appendChild(btn);
    });
  }

  function focusInput() {
    inputEl.focus();
  }

  function wireSend() {
    const fire = () => {
      const val = (inputEl.value || "").trim();
      if (!val) return;
      inputEl.value = "";
      if (onSend) onSend(val);
      focusInput();
    };
    sendEl.addEventListener("click", fire);
    inputEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        fire();
      }
    });
  }

  wireSend();

  return {
    addMessage,
    setThinking,
    setSummary,
    setQuickActions,
    focusInput,
    onUserSend(fn) { onSend = typeof fn === "function" ? fn : null; }
  };
}

export default { createChatUI };
