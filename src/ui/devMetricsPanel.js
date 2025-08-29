// Painel flutuante de métricas do backend (dev)
import { getEnv } from "../compat/robottoShim.js";

(async function () {
  const env = await getEnv().catch(() => null);
  const base = env?.TRIAGE_API_BASE?.replace(/\/+$/, "");
  mount("Carregando…");
  if (!base) return render("Backend OFF (TRIAGE_API_BASE vazio)", "");
  await refresh(base);
  setInterval(() => refresh(base), 15000);
})();

function mount(initial) {
  if (document.getElementById("robotto-dev-metrics")) return;
  const el = document.createElement("div");
  el.id = "robotto-dev-metrics";
  el.style = [
    "position:fixed","right:12px","bottom:12px","z-index:9999","max-width:360px",
    "font:12px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial",
    "background:#111a","color:#fff","backdrop-filter:blur(6px)",
    "border:1px solid #2a2f36","border-radius:8px","padding:10px 12px",
    "box-shadow:0 6px 18px rgba(0,0,0,.25)"
  ].join(";");
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
      <div><b>Backend</b> <span style="opacity:.8">(debug)</span></div>
      <button id="dev-metrics-close" style="all:unset;cursor:pointer;padding:4px 6px;border-radius:6px;border:1px solid #2a2f36;background:#222;">✕</button>
    </div>
    <div id="dev-metrics-body" style="margin-top:6px">${initial}</div>
  `;
  document.body.appendChild(el);
  document.getElementById("dev-metrics-close").onclick = () => el.remove();
}
function render(html) {
  const body = document.getElementById("dev-metrics-body");
  if (body) body.innerHTML = html;
}
async function refresh(base) {
  try {
    const [m, d] = await Promise.all([
      fetch(`${base}/api/metrics`).then((r) => r.json()),
      fetch(`${base}/api/registry/debug`).then((r) => r.json())
    ]);
    render(`
      <div><b>URL:</b> ${escape(base)}</div>
      <div style="margin-top:6px"><b>Métricas</b>:
        <ul style="margin:4px 0 0 16px;padding:0">
          <li>requests: ${m.requests ?? 0}</li>
          <li>llm_calls: ${m.llm_calls ?? 0} | success: ${m.llm_success ?? 0}</li>
          <li>fallback_hits: ${m.fallback_hits ?? 0}</li>
          <li>merged_features_total: ${m.merged_features_total ?? 0}</li>
        </ul>
      </div>
      <div style="margin-top:6px"><b>Registry</b>:
        <div>features: ${d.features_count ?? 0} | aliases: ${d.aliases_count ?? 0}</div>
      </div>
    `);
  } catch (e) {
    render(`<span style="color:#ff8">${escape(String(e))}</span>`);
  }
}
function escape(s){return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");}
