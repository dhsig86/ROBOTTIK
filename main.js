// File: /main.js
// Landing controller: termos, toggle de tema, splash e navegação para o chat.

const els = {
  themeToggle: document.getElementById("themeToggle"),
  agree: document.getElementById("agree"),
  btnStart: document.getElementById("btnStart"),
  terms: document.getElementById("termsText"),
  splash: document.getElementById("splash"),
  year: document.getElementById("year"),
  appVersion: document.getElementById("appVersion"),
};

init();

function init() {
  // Rodapé e versão
  if (els.year) els.year.textContent = new Date().getFullYear();
  if (els.appVersion) els.appVersion.textContent = (window.APP_VERSION || "dev");

  // Tema persistente (mesma lógica do chat)
  initTheme();

  // Aceite dos termos
  wireTerms();

  // Prefetch: se já aceitou antes, pré-habilita
  const TOS_KEY = "robotto_tos_ok";
  const acceptedBefore = localStorage.getItem(TOS_KEY) === "1";
  if (acceptedBefore && els.agree && els.btnStart) {
    els.agree.checked = true;
    els.btnStart.disabled = false;
  }
}

function initTheme() {
  const root = document.documentElement;
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

  if (els.themeToggle) {
    els.themeToggle.addEventListener("click", () => {
      const curr = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", curr);
      localStorage.setItem(KEY, curr);
    });
  }
}

function wireTerms() {
  const TOS_KEY = "robotto_tos_ok";

  if (els.agree && els.btnStart) {
    els.agree.addEventListener("change", () => {
      els.btnStart.disabled = !els.agree.checked;
    });

    // Enter também prossegue quando o foco está na checkbox e está marcada
    els.agree.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && els.agree.checked && !els.btnStart.disabled) {
        e.preventDefault();
        startFlow();
      }
    });

    els.btnStart.addEventListener("click", () => {
      if (els.agree.checked) {
        localStorage.setItem(TOS_KEY, "1");
        startFlow();
      }
    });
  }
}

function startFlow() {
  // Splash curto e navegação
  showSplash(true);
  // pequeno delay para feedback visual
  setTimeout(() => {
    // Caminho do chat (arquivo real do app)
    window.location.href = "src/pages/triageChat.html";
  }, 600);
}

function showSplash(on) {
  if (!els.splash) return;
  els.splash.classList.toggle("active", !!on);
}
