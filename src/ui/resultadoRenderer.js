// File: src/ui/resultadoRenderer.js
// Renderiza via, alarmes, resumo e top diagnósticos.

export function renderResultados({ container, outputs, ranking, registry }) {
  if (!container) return;
  container.innerHTML = "";

  const via = outputs?.via || "ambulatorio_rotina";
  const alarmes = Array.isArray(outputs?.alarmes) ? outputs.alarmes : [];
  const resumo = outputs?.resumo || {};

  // Painel: Via
  container.appendChild(panel(`
    <h3>Via de atendimento</h3>
    <div class="kv">
      <div class="row"><strong>Via:</strong><span>${via}</span></div>
      <div class="row"><strong>Alarmes:</strong><span>${alarmes.join(", ") || "—"}</span></div>
    </div>
  `));

  // Painel: Resumo
  container.appendChild(panel(`
    <h3>Resumo</h3>
    <div class="kv">
      <div class="row"><strong>Paciente:</strong><span>${fmtPaciente(resumo?.paciente)}</span></div>
      <div class="row"><strong>HPI:</strong><span>${escapeHtml(resumo?.hpi || "—")}</span></div>
      <div class="row"><strong>Sintomas:</strong><span>${(resumo?.sintomas || []).join(", ") || "—"}</span></div>
    </div>
  `));

  // Painel: Top diagnósticos
  const list = document.createElement("div");
  list.className = "dx-list";
  (ranking || []).slice(0, 5).forEach((r) => {
    const pct = Math.round((r.posterior || 0) * 100);
    const name =
      registry?.byGlobalId?.[r.global_id]?.entries?.[0]?.label ||
      r.global_id || "—";
    const item = document.createElement("div");
    item.className = "dx-item";
    item.innerHTML = `<div>${escapeHtml(name)}</div><div class="p">${pct}%</div>`;
    list.appendChild(item);
  });
  container.appendChild(panel(`<h3>Hipóteses</h3>`)).appendChild(list);
}

function panel(innerHtml) {
  const p = document.createElement("div");
  p.className = "panel";
  p.innerHTML = innerHtml;
  return p;
}

function fmtPaciente(p) {
  if (!p) return "—";
  const partes = [];
  if (p?.nome) partes.push(escapeHtml(p.nome));
  if (Number.isFinite(p?.idade)) partes.push(`${p.idade} anos`);
  if (p?.sexo) partes.push(p.sexo);
  return partes.join(", ") || "—";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m])
  );
}
