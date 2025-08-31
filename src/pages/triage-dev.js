// File: src/pages/triage-dev.js
import { triage, explainTop } from "../core/triageEngine.js";
import { loadRegistry } from "../core/conditionRegistry.js";

// ====== util: tenta importar módulos opcionais (storage / export) com fallback
let storageMod = null;
let exportMod = null;
try {
  storageMod = await import("../core/storage.js");
} catch {}
try {
  exportMod = await import("../api/reportExportClient.js");
} catch {}

function el(id) {
  return document.getElementById(id);
}

function pct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}

// --- NBQ state ---
let LAST_RAW = null;

function byId(id) {
  return document.getElementById(id);
}

// ====== monta lista de sintomas a partir do intake de todas as áreas
async function buildSymptomsUI(registry) {
  const wrap = el("symptoms");
  wrap.innerHTML = "";

  // junta todos os sintomas dos intakes
  const seen = new Set();
  const items = [];
  for (const area of registry.areas) {
    const list = registry.byArea[area]?.intake?.symptoms || [];
    for (const s of list) {
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      items.push({ id: s.id, label: s.label || s.id });
    }
  }
  items.sort((a, b) => a.label.localeCompare(b.label, "pt"));

  // cria os checkboxes
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const lab = document.createElement("label");
    lab.innerHTML = `<input type="checkbox" data-symptom="${it.id}"> ${it.label}`;
    frag.appendChild(lab);
  }
  wrap.appendChild(frag);
}

function getSelectedSymptoms() {
  const wrap = el("symptoms");
  const chk = wrap.querySelectorAll('input[type="checkbox"][data-symptom]');
  const out = [];
  chk.forEach((c) => {
    if (c.checked) out.push(c.getAttribute("data-symptom"));
  });
  return out;
}

function setSymptomChecked(featureId, checked = true) {
  const wrap = el("symptoms");
  const node = wrap.querySelector(`input[data-symptom="${featureId}"]`);
  if (node) node.checked = !!checked;
}

// ====== NBQ (Pergunta seguinte)
function renderNBQ(nextQuestions = []) {
  const box = el("nbq");
  const grid = el("nbq-items");
  grid.innerHTML = "";

  if (!nextQuestions?.length) {
    box.style.display = "none";
    return;
  }
  box.style.display = "";

  for (const q of nextQuestions) {
    const fid = q.featureId || q.id;
    const questionText = q.question || q.label || "Pergunta não definida";

    let inputHtml = "";
    if (q.kind === "number") {
      // usa delegação: data-feature e class nbq-input
      inputHtml = `
        <input type="number"
               class="nbq-input"
               data-feature="${fid}"
               ${q.unit ? `placeholder="${q.unit}"` : ""}
               style="width:90px">
        <button class="btn" data-q-skip="1" style="margin-left:8px">Pular</button>
      `;
    } else if (q.kind === "categorical" && Array.isArray(q.options)) {
      inputHtml = `
        <select class="nbq-input" data-feature="${fid}">
          <option value="">—</option>
          ${q.options.map((opt) => `<option value="${opt}">${opt}</option>`).join("")}
        </select>
        <button class="btn" data-q-skip="1" style="margin-left:8px">Pular</button>
      `;
    } else {
      // boolean (padrão)
      inputHtml = `
        <button class="btn" data-q-yes="${fid}">Sim</button>
        <button class="btn" data-q-no="${fid}" style="background:#666;border-color:#666">Não</button>
        <button class="btn" data-q-skip="1" style="background:#999;border-color:#999">Não sei</button>
      `;
    }

    const card = document.createElement("div");
    card.className = "box";
    card.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px">${questionText}</div>
      <div class="row">${inputHtml}</div>
      <div class="muted" style="font-size:.85em;margin-top:6px">
        ${[
          q.note ? q.note : "",
          q.source ? `Fonte: ${q.source}` : "",
          q.why ? `Por que perguntar: ${q.why}` : "",
        ]
          .filter(Boolean)
          .join(" • ")}
      </div>
    `;
    grid.appendChild(card);
  }
}

// Atualize addSymptomToSelection para aceitar valor e remover quando vazio
function addSymptomToSelection(fid, value = true) {
  const bag = (window.__extraSymptoms = window.__extraSymptoms || {});
  if (value === false || value === "" || value == null) {
    delete bag[fid];
  } else {
    bag[fid] = value;
  }
}

// ====== inicia o triage
async function startTriage() {
  const registry = await loadRegistry();
  window.__registry = registry;

  // --- sintomas adicionais (se houver)
  const extra = window.__extraSymptoms || {};
  for (const k in extra) {
    if (extra[k]) setSymptomChecked(k, true);
  }

  // --- sintomas padrão (se houver)
  const def = registry.config?.defaultSymptoms || [];
  for (const k of def) {
    setSymptomChecked(k, true);
  }

  // --- monta UI de sintomas
  await buildSymptomsUI(registry);

  // --- inicia triagem
  const initial = await triage({
  idade: Number(el("idade")?.value) || null,
  sexo: el("sexo")?.value || null,
  hpi: el("hpi")?.value || "",
  symptoms: getSelectedSymptoms(),
}, { mode: "gated" });
  renderNBQ(initial.nextQuestions);

  // --- explica primeira pergunta
  explainFirstQuestion(initial.nextQuestions);
}

function explainFirstQuestion(nextQuestions) {
  const box = el("explanation");
  box.innerHTML = "";

  if (!nextQuestions?.length) {
    box.style.display = "none";
    return;
  }
  box.style.display = "";

  const q = nextQuestions[0];
  const text = explainTop(q);
  box.innerHTML = text;
}

// ====== controle de eventos
function onSymptomChange(e) {
  const chk = e.target;
  if (!chk.closest("[data-symptom]")) return;

  const fid = chk.getAttribute("data-symptom");
  const checked = chk.checked;

  addSymptomToSelection(fid, checked);
  // console.log("addSymptomToSelection", fid, checked);

  // reinicia triagem ao mudar sintomas
  startTriage();
}

function onNBQChange(e) {
  const btn = e.target.closest(".btn");
  if (!btn) return;

  const wrap = btn.closest("#nbq-items");
  const fid = btn.getAttribute("data-q-yes") || btn.getAttribute("data-q-no");
  const skip = btn.getAttribute("data-q-skip");

  if (fid) {
    const isYes = btn.hasAttribute("data-q-yes");
    const isNo = btn.hasAttribute("data-q-no");

    // marca resposta como "sim" ou "não"
    wrap.querySelectorAll(".btn").forEach((b) => {
      if (b.hasAttribute("data-q-yes")) b.classList.remove("selected");
      if (b.hasAttribute("data-q-no")) b.classList.remove("selected");
    });
    if (isYes) {
      btn.classList.add("selected");
    } else if (isNo) {
      btn.classList.add("selected");
    }
  }

  if (skip) {
    // pula pergunta
    const nextQuestions = [];
    renderNBQ(nextQuestions);
    return;
  }

  // avança triagem
  const registry = window.__registry;
  const answers = {};
  wrap.querySelectorAll(".btn.selected").forEach((b) => {
    const fid = b.getAttribute("data-q-yes") || b.getAttribute("data-q-no");
    if (fid) answers[fid] = b.hasAttribute("data-q-yes");
  });

  const result = triage(registry, answers, getSelectedSymptoms());
  renderNBQ(result.nextQuestions);

  // --- atualiza explicação
  explainFirstQuestion(result.nextQuestions);
}

// --- inicia
el("symptoms").addEventListener("change", onSymptomChange);
el("nbq").addEventListener("click", onNBQChange);

startTriage();
