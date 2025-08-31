// scripts/smoke.mjs
// Smoke: server estático + páginas/CSS + engine local + contrato backend (opcional).
// Node >= 18.

import { createServer } from "http";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import { extname, join, normalize } from "path";

const PORT = Number(process.env.PORT || 4173);
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "");
const TEST_ORIGIN = process.env.TEST_ORIGIN || `http://127.0.0.1:${PORT}`;
const CHECK_CORS = (process.env.CHECK_CORS || "0") === "1";
const ROUTER_MODE = process.argv.includes("--always") ? "always" : "gated";

// ---------- static server ---------------------------------------------------
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveFile(req, res, filePath) {
  res.setHeader("Content-Type", mime[extname(filePath).toLowerCase()] || "application/octet-stream");
  createReadStream(filePath)
    .on("error", (e) => { res.statusCode = 500; res.end(String(e)); })
    .pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    let url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/") url = "/index.html";
    url = url.replace(/\\/g, "/").replace(/\.\./g, ""); // anti path-traversal
    const resolved = normalize(join(process.cwd(), "." + url));
    const st = await stat(resolved).catch(() => null);
    if (!st) { res.statusCode = 404; res.end("Not Found"); return; }
    if (st.isDirectory()) {
      const idx = normalize(join(resolved, "index.html"));
      const st2 = await stat(idx).catch(() => null);
      if (st2) return serveFile(req, res, idx);
      res.statusCode = 403; res.end("Forbidden"); return;
    }
    return serveFile(req, res, resolved);
  } catch (e) { res.statusCode = 500; res.end(String(e)); }
});

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function startServer(){ await new Promise(r=>server.listen(PORT, r)); process.stdout.write(`[smoke] static server on ${BASE_URL}\n`); }
async function stopServer(){ await new Promise(r=>server.close(r)); }

// ---------- helpers ---------------------------------------------------------
function assert(cond, msg){ if(!cond) throw new Error(msg); }
async function httpGet(path, expect=200, extraInit = {}){
  const url = path.startsWith("http") ? path : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, extraInit);
  assert(res.status===expect, `GET ${url} expected ${expect}, got ${res.status}`);
  const text = await res.text();
  return {res, text, url};
}
async function httpJSON(url, init){
  const res = await fetch(url, init);
  const bodyTxt = await res.text();
  let body;
  try { body = JSON.parse(bodyTxt); } catch { body = null; }
  return { res, body, bodyTxt };
}
function installFetchPrefixer(base){
  const origFetch = globalThis.fetch;
  if (typeof origFetch !== "function") throw new Error("Node 18+ é necessário (fetch nativo).");
  globalThis.fetch = (input, init) => {
    let url = input;
    if (typeof url === "string") {
      if (url.startsWith("/")) url = base + url;
      else if (url.startsWith("src/")) url = `${base}/${url}`;
    }
    return origFetch(url, init);
  };
}
function getVia(outputs){ return outputs?.viaAtendimento || outputs?.via || "(indefinido)"; }
function getAlarmes(outputs){ return outputs?.sinaisAlarme || outputs?.alarmes || []; }
function getNBQ(res){ return Array.isArray(res?.nbq) ? res.nbq : (res?.outputs?.next_questions || []); }

// ---------- main ------------------------------------------------------------
async function run(){
  await startServer();
  await sleep(120);

  // 1) Front: landing/chat/css
  const root = await httpGet("/", 200);
  assert(/ROBOTTO/i.test(root.text), "landing deve conter ROBOTTO");
  const hasCTA = /Iniciar triagem|Prosseguir para o chat/i.test(root.text);
  const hasLinkToChat = /src\/pages\/triageChat\.html/i.test(root.text);
  const hasMetaRefresh = /http-equiv="refresh"/i.test(root.text);
  assert(hasCTA || hasLinkToChat || hasMetaRefresh, "landing deve linkar/redirect para triageChat.html");

  const chat = await httpGet("/src/pages/triageChat.html", 200);
  assert(/\.\.\/styles\/theme\.css/.test(chat.text) && /\.\.\/styles\/chat\.css/.test(chat.text),
    "triageChat.html deve importar ../styles/theme.css e ../styles/chat.css");

  await httpGet("/src/styles/theme.css", 200);
  await httpGet("/src/styles/chat.css", 200);

  const footerRegex = /Criado por Dr\. Dario Hart.*OTOSIG.*Telemedicina/i;
  assert(footerRegex.test(root.text) || footerRegex.test(chat.text),
    "footer de autoria ausente em landing e chat");

  // 2) Engine local
  installFetchPrefixer(BASE_URL);
  const { triage, explainTop } = await import("../src/core/triageEngine.js");
  const { loadRegistry } = await import("../src/core/conditionRegistry.js");

  const raw = {
    symptoms: ["rinorreia","obstrucao_nasal","odinofagia","plenitude_auricular","linfonodo_cervical_aumentado"],
    idade: 70, sexo: "M",
    comorbidades: ["tabagista"],
    hpi: "Há 3 dias: coriza, leve dor de garganta, ouvido tampado.",
  };

  const res = await triage(raw, { mode: ROUTER_MODE });
  const registry = await loadRegistry();

  console.log("=== ROBOTTO Smoke Test ===");
  console.log("BASE_URL  :", BASE_URL);
  console.log("Router    :", ROUTER_MODE);
  console.log("Áreas     :", (res?.areas||[]).join(", "));
  console.log("Top-1     :", explainTop(res?.ranking||[], registry));
  console.log("Via       :", getVia(res?.outputs||{}));
  console.log("Alarmes   :", getAlarmes(res?.outputs||{}));
  console.log("Resumo    :", res?.outputs?.resumo);

  // Micro-tests clínicos
  try {
    const lcrCase = await triage({ symptoms: ["rinorreia_liquida_clara"], idade: 40, sexo: "F", hpi: "Saída de líquido claro pelo nariz desde ontem." }, { mode: ROUTER_MODE });
    const via = getVia(lcrCase?.outputs||{});
    if (via !== "emergencia_geral") {
      console.error(`[Smoke Error] LCR esperado 'emergencia_geral', veio '${via}'.`);
      console.error(">> alarmes =", getAlarmes(lcrCase?.outputs||{}));
      process.exitCode = 1;
    } else { console.log("✔ Micro-test LCR: via = emergencia_geral"); }
  } catch (e) { console.error("[Smoke Error] LCR exceção:", e); process.exitCode = 1; }

  {
    const r2 = await triage({ symptoms: ["estridor"], idade: 22, sexo: "M" }, { mode: ROUTER_MODE });
    const via2 = getVia(r2?.outputs||{});
    if (via2 !== "emergencia_geral") {
      console.error("✘ Micro-test Estridor: via esperada emergencia_geral, obtido:", via2);
      process.exit(1);
    } else {
      console.log("✔ Micro-test Estridor: via = emergencia_geral");
      const nbq = getNBQ(r2);
      if (!Array.isArray(nbq) || nbq.length === 0) throw new Error("NBQ: nenhuma sugestão");
      console.log(`✔ Micro-test NBQ: ${nbq.length} sugestão(ões)`);
    }
  }

  // 3) Backend (opcional): contrato e CORS
  if (BACKEND_URL) {
    console.log(`[backend] Checking contract at ${BACKEND_URL}`);

    // GET /
    {
      const { res, body, bodyTxt } = await httpJSON(`${BACKEND_URL}/`, { headers: { Origin: TEST_ORIGIN }});
      assert(res.status === 200, "GET / do backend deve responder 200");
      const ok = /ROBOTTO backend OK/i.test(bodyTxt || "");
      assert(ok, "backend / deve conter 'ROBOTTO backend OK'");
      if (CHECK_CORS) {
        const aco = res.headers.get("access-control-allow-origin");
        assert(aco === TEST_ORIGIN || aco === "*", "CORS: ACAO não corresponde ao TEST_ORIGIN");
      }
    }

    // GET /api/registry/debug
    {
      const { res, body } = await httpJSON(`${BACKEND_URL}/api/registry/debug`, { headers: { Origin: TEST_ORIGIN }});
      assert(res.status === 200, "GET /api/registry/debug deve responder 200");
      assert(body && typeof body === "object", "registry/debug deve retornar JSON");
      assert(typeof body.features_count === "number", "registry.debug.features_count ausente");
      if (CHECK_CORS) {
        const aco = res.headers.get("access-control-allow-origin");
        assert(aco === TEST_ORIGIN || aco === "*", "CORS: ACAO não corresponde ao TEST_ORIGIN (registry/debug)");
      }
    }

    // POST /api/triage
    {
      const allowed = ["rinorreia", "estridor", "odinofagia"];
      const { res, body } = await httpJSON(`${BACKEND_URL}/api/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: TEST_ORIGIN },
        body: JSON.stringify({
          text: "Paciente com coriza importante e ruído de estridor ao respirar.",
          want: "extract",
          featuresMap: allowed
        })
      });
      assert(res.status === 200, "POST /api/triage deve responder 200");
      assert(body && Array.isArray(body.features), "triage.features deve ser array");
      // Cada feature retornada deve estar em allowed (contrato de filtragem)
      const allAllowed = body.features.every(f => allowed.includes(f));
      assert(allAllowed, "triage.features contém IDs fora do allowed");
      assert(body.modifiers && typeof body.modifiers === "object", "triage.modifiers ausente/obj inválido");
      assert(body.demographics && typeof body.demographics === "object", "triage.demographics ausente/obj inválido");
      if (CHECK_CORS) {
        const aco = res.headers.get("access-control-allow-origin");
        assert(aco === TEST_ORIGIN || aco === "*", "CORS: ACAO não corresponde ao TEST_ORIGIN (triage)");
      }
      console.log("✔ Backend /api/triage contract OK");
    }
  } else {
    console.log("[backend] BACKEND_URL not set — skipping backend checks");
  }

  await stopServer();
  console.log("SMOKE_OK");
}

run().catch(async (e) => {
  console.error("[smoke] FAIL:", e?.stack || e);
  try { await stopServer(); } catch {}
  process.exit(1);
});
