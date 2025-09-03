// File: /main.js
// Controller da landing: tema + aceite + splash + navegação para o chat.

const els = {
  themeToggle: document.getElementById("themeToggle"),
  agree: document.getElementById("agree"),
  btnStart: document.getElementById("btnStart"),
  actions: document.querySelector(".actions"),
  splash: document.getElementById("splash"),
  year: document.getElementById("year"),
  appVersion: document.getElementById("appVersion"),
};

init();

function init() {
  // Rodapé e versão
  if (els.year) els.year.textContent = new Date().getFullYear();
  if (els.appVersion) els.appVersion.textContent = (window.APP_VERSION || "dev");

  // Tema como no chat
  initTheme();

  // Garante que o botão exista (auto-repair)
  ensureStartButton();

  // Liga aceite
  wireTerms();
}

function initTheme() {
  const root = document.documentElement;
  const KEY = "robotto_theme";
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") {
    root.setAttribute("data-theme", saved);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    root.setAttribute("data-theme", "light");
  } else {
    root.setAttribute("data-theme", "dark");
  }
  els.themeToggle?.addEventListener("click", () => {
    const curr = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", curr);
    localStorage.setItem(KEY, curr);
  });
}

function ensureStartButton() {
  if (!els.btnStart && els.actions) {
    const btn = document.createElement("button");
    btn.id = "btnStart";
    btn.className = "primary";
    btn.disabled = true;
    btn.textContent = "Prosseguir para o chat";
    els.actions.prepend(btn);
    els.btnStart = btn;
  }
}

function wireTerms() {
  const TOS_KEY = "robotto_tos_ok";

  const acceptedBefore = localStorage.getItem(TOS_KEY) === "1";
  if (acceptedBefore && els.agree) els.agree.checked = true;
  if (els.btnStart) els.btnStart.disabled = !(els.agree?.checked);

  els.agree?.addEventListener("change", () => {
    if (els.btnStart) els.btnStart.disabled = !els.agree.checked;
  });

  els.agree?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && els.agree.checked && !els.btnStart?.disabled) {
      e.preventDefault();
      startFlow();
    }
  });

  els.btnStart?.addEventListener("click", () => {
    if (!els.btnStart.disabled) {
      localStorage.setItem(TOS_KEY, "1");
      startFlow();
    }
  });
}

function startFlow() {
  showSplash(true);
  setTimeout(() => {
    window.location.href = "src/pages/triageChat.html";
  }, 600);
}

function showSplash(on) {
  els.splash?.classList.toggle("active", !!on);
}
