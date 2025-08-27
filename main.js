// UI mínima que conversa direto com o core.
// Carrega sintomas por áreas via conditionRegistry, chama triage() e renderiza.
// Inclui salvar em localStorage e exportar .md do relatório.

import { loadRegistry } from "./src/core/conditionRegistry.js";
import { triage, explainTop } from "./src/core/triageEngine.js";

const $ = (sel) => document.querySelector(sel);

const areasAll = ["ouvido", "nariz", "garganta", "pescoco"];
let registryCache = null;

async function ensureRegistry() {
  if (!registryCache) registryCache = await loadRegistry();
  return registryCache;
}

function renderAreaPills(
  selected = new Set(["ouvido", "nariz", "garganta", "pescoco"]),
) {
  const host = $("#areaPills");
  host.innerHTML = "";
  for (const a of areasAll) {
    const id = `pill_${a}`;
    const div = document.createElement("label");
    div.className = "pill";
    div.innerHTML = `<input type="checkbox" id="${id}" ${selected.has(a) ? "checked" : ""}/> ${a}`;
    host.appendChild(div);
  }
}

function getSelectedAreas() {
  const out = [];
  for (const a of areasAll) {
    const el = document.getElementById(`pill_${a}`);
    if (el?.checked) out.push(a);
  }
  return out.length ? out : areasAll.slice();
}

async function renderSymptomsBox() {
  const reg = await ensureRegistry();
  const host = $("#symptomsBox");
  host.innerHTML = "";

  const selectedAreas = getSelectedAreas();
  // junta sintomas de intake das áreas selecionadas
  const seen = new Set();
  const items = [];
  for (const a of selectedAreas) {
    const intake = reg.byArea[a]?.intake?.symptoms || [];
    for (const s of intake) {
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      items.push({ id: s.id, label: s.label || s.id });
    }
  }

  // ordena por label
  items.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  if (!items.length) {
    host.innerHTML = `<div class="muted">Sem sintomas sugeridos para as áreas atuais.</div>`;
    return;
  }

  // desenha em colunas
  const frag = document.createDocumentFragment();
  for (const it of items) {
    const id = `sym_${it.id}`;
    const label = document.createElement("label");
    label.className = "pill";
    label.innerHTML = `<input type="checkbox" id="${id}" /> ${it.label}`;
    frag.appendChild(label);
  }
  host.appendChild(frag);
}

function collectInput() {
  // symptoms selecionados
  const sym = [];
  document
    .querySelectorAll("#symptomsBox input[type=checkbox]:checked")
    .forEach((cb) => {
      const id = cb.id.replace(/^sym_/, "");
      sym.push(id);
    });
  // paciente & texto
  const raw = {
    paciente_nome: $("#in_nome").value.trim() || null,
    idade: $("#in_idade").value ? Number($("#in_idade").value) : null,
    sexo: $("#in_sexo").value || null,
    symptoms: sym,
    text: $("#in_text").value || "",
  };
  return raw;
}

function pct(x) {
  return Math.round((x || 0) * 100);
}

function markdownFromOutputs(outputs, ranking) {
  const lines = [];
  lines.push(`# Relatório de Triagem – ROBOTTO`);
  lines.push("");
  const p = outputs?.resumo?.paciente || {};
  lines.push(
    `**Paciente:** ${p.nome || "-"} | **Idade:** ${p.idade ?? "-"} | **Sexo:** ${p.sexo || "-"}`,
  );
  lines.push("");
  lines.push(`**Sintomas informados:**`);
  for (const s of outputs.resumo.sintomas || []) lines.push(`- ${s}`);
  if (outputs.resumo.hpi) {
    lines.push("");
    lines.push(`**HPI/Queixa:** ${outputs.resumo.hpi}`);
  }
  lines.push("");
  lines.push(`**Hipóteses principais:**`);
  (ranking || []).slice(0, 5).forEach((r, i) => {
    lines.push(`${i + 1}. ${r.global_id} — ~${pct(r.posterior)}%`);
  });
  lines.push("");
  lines.push(`**Sinais de alarme:**`);
  if ((outputs.alarmes || []).length) {
    outputs.alarmes.forEach((a) => lines.push(`- ${a}`));
  } else {
    lines.push(`- Não identificados.`);
  }
  lines.push("");
  lines.push(`**Cuidados iniciais:**`);
  (outputs.cuidados || []).forEach((c) => lines.push(`- ${c}`));
  lines.push("");
  lines.push(`**Via de atendimento sugerida:** **${outputs.via}**`);
  lines.push("");
  lines.push(`_Gerado por ROBOTTO._`);
  return lines.join("\n");
}

function renderResult({ outputs, ranking, registry }) {
  const host = $("#resultPane");
  if (!outputs) {
    host.innerHTML = `<div class="muted">Sem resultados.</div>`;
    return;
  }

  const topLine = explainTop(ranking, registry);
  const kpiHtml = `
    <div class="kpi">
      <div class="box"><b>Via</b><div class="via">${outputs.via}</div></div>
      <div class="box"><b>Alarmes</b><div>${outputs.alarmes?.length || 0}</div></div>
    </div>
  `;

  const rankHtml = (ranking || [])
    .slice(0, 5)
    .map(
      (r, i) =>
        `<li>${i + 1}. <code>${r.global_id}</code> — <b>~${pct(r.posterior)}%</b></li>`,
    )
    .join("");

  const alarmesHtml =
    (outputs.alarmes || []).map((a) => `<li>${a}</li>`).join("") ||
    `<li class="muted">Sem sinais de alarme.</li>`;

  const sintomasHtml = (outputs.resumo?.sintomas || [])
    .map((s) => `<span class="tag">${s}</span>`)
    .join("");

  host.innerHTML = `
    <div class="muted">Top-1: ${topLine}</div>
    ${kpiHtml}
    <div style="margin-top:8px">
      <div class="muted">Paciente</div>
      <div class="tags" style="margin:6px 0 10px 0">
        <span class="tag">Nome: ${outputs.resumo?.paciente?.nome || "-"}</span>
        <span class="tag">Idade: ${outputs.resumo?.paciente?.idade ?? "-"}</span>
        <span class="tag">Sexo: ${outputs.resumo?.paciente?.sexo || "-"}</span>
      </div>

      <div class="muted">Sintomas</div>
      <div class="tags">${sintomasHtml || '<span class="tag muted">—</span>'}</div>

      ${outputs.resumo?.hpi ? `<div style="margin-top:10px"><div class="muted">HPI</div><div>${outputs.resumo.hpi}</div></div>` : ""}

      <div style="margin-top:12px">
        <div class="muted">Ranking</div>
        <ol class="rank">${rankHtml}</ol>
      </div>

      <div style="margin-top:12px">
        <div class="muted">Sinais de alarme</div>
        <ul class="alarmes">${alarmesHtml}</ul>
      </div>

      <div style="margin-top:12px">
        <div class="muted">Cuidados iniciais</div>
        <ul class="alarmes">${(outputs.cuidados || []).map((c) => `<li>${c}</li>`).join("")}</ul>
      </div>
    </div>
  `;
}

function toast(msg) {
  $("#toast").textContent = msg;
  setTimeout(() => ($("#toast").textContent = ""), 3000);
}

function saveCase(payload) {
  const key = "robotto_cases";
  const arr = JSON.parse(localStorage.getItem(key) || "[]");
  const id = Date.now().toString(36);
  arr.push({ id, ts: Date.now(), payload });
  localStorage.setItem(key, JSON.stringify(arr));
  return id;
}

async function runTriage() {
  const raw = collectInput();

  // modo de roteamento: se o usuário desmarcar áreas, ainda rodamos 'gated' (o engine decide).
  const mode = "gated";

  // passa input ao triage
  const res = await triage(raw, { mode });
  const registry = await ensureRegistry();

  renderResult({ outputs: res.outputs, ranking: res.ranking, registry });

  // guarda último resultado no escopo para exportar/salvar
  window.__robotto_last = { raw, ...res };
}

async function init() {
  renderAreaPills(); // desenha as 4 áreas
  await ensureRegistry(); // carrega regras para montar sintomas
  await renderSymptomsBox();

  // listeners
  $("#areaPills").addEventListener("change", renderSymptomsBox);
  $("#btnTriar").addEventListener("click", runTriage);

  $("#btnLimpar").addEventListener("click", async () => {
    $("#in_nome").value = "";
    $("#in_idade").value = "";
    $("#in_sexo").value = "";
    $("#in_text").value = "";
    document
      .querySelectorAll("#symptomsBox input[type=checkbox]")
      .forEach((cb) => (cb.checked = false));
    $("#resultPane").innerHTML =
      `<div class="muted">Preencha os campos e clique em <b>Triar</b>.</div>`;
    toast("Formulário limpo.");
  });

  $("#btnSalvar").addEventListener("click", () => {
    const last = window.__robotto_last;
    if (!last?.outputs) {
      toast("Execute a triagem primeiro.");
      return;
    }
    const id = saveCase(last);
    toast(`Caso salvo: ${id}`);
  });

  $("#btnExportar").addEventListener("click", () => {
    const last = window.__robotto_last;
    if (!last?.outputs) {
      toast("Execute a triagem primeiro.");
      return;
    }
    const md = markdownFromOutputs(last.outputs, last.ranking);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `relatorio_robotto_${ts}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(
      "Relatório gerado (.md). Para PDF, abra o .md e exporte, ou use imprimir na UI final.",
    );
  });
}

// boot
init().catch((err) => {
  console.error(err);
  toast("Falha ao iniciar UI — veja o console.");
});
