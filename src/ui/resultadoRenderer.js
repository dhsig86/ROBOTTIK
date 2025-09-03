// src/ui/resultadoRenderer.js
// Render dos 4 outputs + ranking no #resultPane.
// Robusto a diferenças de chave: via/viaAtendimento, alarmes/sinaisAlarme, etc.

function pct(x) {
  const n = typeof x === "number" ? x : Number(x || 0);
  return `${Math.round(n * 100)}%`;
}
function labelDx(item, registry) {
  const gid = item?.global_id || item?.id || "";
  const entry = registry?.byGlobalId?.[gid];
  const name = entry?.entries?.[0]?.label || gid || "Hipótese";
  return name;
}

export function renderResultados({ container, outputs, ranking, registry }) {
  if (!container) return;
  container.innerHTML = "";

  // Normalizações
  const via = outputs?.via || outputs?.viaAtendimento || "ambulatorio_rotina";
  const alarmes = outputs?.alarmes || outputs?.sinaisAlarme || [];
  const cuidados = outputs?.cuidados || [];
  const resumo = outputs?.resumo;

  // Header
  const h = document.createElement("div");
  h.className = "result-header";
  h.innerHTML = `<h2>Resultados</h2><div class="via via-${via}">Via: ${via.replace(/_/g," ")}</div>`;
  container.appendChild(h);

  // Ranking (top-3)
  if (Array.isArray(ranking) && ranking.length) {
    const rk = document.createElement("div");
    rk.className = "card";
    rk.innerHTML = `<h3>Hipóteses principais</h3>`;
    const ul = document.createElement("ol");
    ul.className = "ranking";
    ranking.slice(0, 3).forEach((r) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${labelDx(r, registry)}</strong> — ${pct(r.posterior ?? 0)}`;
      ul.appendChild(li);
    });
    rk.appendChild(ul);
    container.appendChild(rk);
  }

  // Alarmes
  const cAl = document.createElement("div");
  cAl.className = "card";
  cAl.innerHTML = `<h3>Sinais de alarme</h3>`;
  if (alarmes.length) {
    const ul = document.createElement("ul");
    alarmes.forEach((a) => {
      const li = document.createElement("li");
      li.textContent = a;
      ul.appendChild(li);
    });
    cAl.appendChild(ul);
  } else {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Nenhum sinal de alarme atual.";
    cAl.appendChild(p);
  }
  container.appendChild(cAl);

  // Cuidados
  const cCu = document.createElement("div");
  cCu.className = "card";
  cCu.innerHTML = `<h3>Cuidados recomendados</h3>`;
  if (cuidados.length) {
    const ul = document.createElement("ul");
    cuidados.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = typeof c === "string" ? c : (c?.label || JSON.stringify(c));
      ul.appendChild(li);
    });
    cCu.appendChild(ul);
  } else {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Serão exibidos aqui quando disponíveis.";
    cCu.appendChild(p);
  }
  container.appendChild(cCu);

  // Resumo
  if (resumo) {
    const cardR = document.createElement("div");
    cardR.className = "card";
    cardR.innerHTML = `<h3>Resumo do caso</h3>
      <pre class="resumo-block">${JSON.stringify(resumo, null, 2)}</pre>`;
    container.appendChild(cardR);
  }
}

export default { renderResultados };
