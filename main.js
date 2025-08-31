// src/main.js
const CHAT_URL = 'src/pages/triageChat.html';
const STORAGE_KEY = 'otto_terms_accepted_v1';

function qs(sel, root = document) { return root.querySelector(sel); }
function on(el, ev, cb) { el && el.addEventListener(ev, cb, { passive: true }); }

function setBtnState(agree) {
  const btn = qs('#btnStart');
  if (!btn) return;
  btn.disabled = !agree;
  btn.setAttribute('aria-disabled', String(!agree));
}

function showSplash(active) {
  const splash = qs('#splash');
  if (!splash) return;
  splash.classList.toggle('active', !!active);
  splash.setAttribute('aria-hidden', String(!active));
}

function gotoChat() {
  // Pequeno atraso só para o splash “aparecer” visualmente
  setTimeout(() => {
    window.location.href = CHAT_URL;
  }, 450);
}

function tryPrefetch(url) {
  try {
    // Warm-up leve (não quebra em file://)
    fetch(url, { method: 'GET', mode: 'no-cors' }).catch(() => {});
  } catch (_) {}
}

function initLanding() {
  // Ano no rodapé
  const yearEl = qs('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Tenta mostrar versão a partir do env (opcional)
  fetch('src/config/env.json').then(r => r.json()).then(env => {
    if (env?.VERSION) qs('#appVersion')?.replaceChildren(document.createTextNode(env.VERSION));
    if (env?.APP_NAME) document.title = `${env.APP_NAME} • Triagem Otorrino`;
  }).catch(() => {});

  // Estado inicial do aceite
  const agreeStored = localStorage.getItem(STORAGE_KEY) === 'true';
  setBtnState(agreeStored);
  if (agreeStored) {
    // Se já aceitou antes, deixamos só habilitado.
    // (Se quiser auto-redirecionar, basta descomentar as 2 linhas abaixo)
    // showSplash(true);
    // gotoChat();
  }

  // Eventos de UI
  const agreeCb = qs('#agree');
  on(agreeCb, 'change', (e) => {
    const checked = e.target.checked;
    setBtnState(checked);
  });

  const btn = qs('#btnStart');
  on(btn, 'click', () => {
    const agree = qs('#agree')?.checked || agreeStored;
    if (!agree) return;

    // Persistência do aceite
    localStorage.setItem(STORAGE_KEY, 'true');

    // Splash e navegação
    showSplash(true);
    tryPrefetch(CHAT_URL);
    gotoChat();
  });

  // Acessibilidade: se focar no texto rolável, damos um hint visual (opcional)
  const terms = qs('#termsText');
  on(terms, 'focus', () => terms.style.outline = `2px solid var(--focus)`);
  on(terms, 'blur',  () => terms.style.outline = 'none');
}

document.addEventListener('DOMContentLoaded', initLanding);
// ROBOTTO — client LLM triage (chama backend /api/triage se disponível) --- IGNORE ---