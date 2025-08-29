// Lê env.json de forma resiliente (local, GH Pages, paths relativos)
// Cacheado para evitar múltiplos fetches.

let _env = null;

export async function getEnv() {
  if (_env) return _env;

  // tenta deduzir a raiz até /src/
  const p = (typeof window !== "undefined" && window.location && window.location.pathname) || "/";
  const idx = p.indexOf("/src/");
  const root = idx >= 0 ? p.slice(0, idx) : "";

  const candidates = [
    `${root}/src/config/env.json`,
    "/src/config/env.json",
    "src/config/env.json",
    "../config/env.json",
    "./config/env.json"
  ];

  let found = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        found = await res.json();
        break;
      }
    } catch {
      /* try next */
    }
  }

  // defaults mínimos
  const defaults = {
    APP_NAME: "ROBOTTO",
    VERSION: "dev",
    LLM_PROVIDER: "off",
    TRIAGE_API_BASE: "",
    SPEECH_ADDON: "off",
    AREAS_ENABLED: ["ouvido", "nariz", "garganta", "pescoco"],
    FEATURE_FLAGS: { multi_area_autodetect: true, save_case_local: true }
  };

  _env = Object.assign({}, defaults, found || {});
  return _env;
}

export default { getEnv };
