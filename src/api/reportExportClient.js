/* File: src/api/reportExportClient.js
 * Exporta um relatório imprimível (HTML → PDF via print do navegador).
 */

function fmtPct(x) {
  if (typeof x !== "number") return "-";
  return `${Math.round(x * 100)}%`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Monta o HTML do relatório */
function buildHTML({ rawInput, outputs, ranking }) {
  const paciente = outputs?.resumo?.paciente ?? {};
  const sintomas = outputs?.resumo?.sintomas ?? [];
  const hpi = outputs?.resumo?.hpi ?? "";

  const top3 = (ranking || []).slice(0, 3);

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatório de Triagem — ROBOTTO</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    :root { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    body { margin: 24px; color: #0a0a0a; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    h2 { margin: 24px 0 8px; font-size: 16px; }
    .muted { color: #555; }
    .chip { display:inline-block; padding:4px 8px; border-radius: 999px; border:1px solid #ddd; margin:2px 4px 2px 0; }
    .box { border:1px solid #e6e6e6; border-radius:12px; padding:12px 14px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #eee; }
    .small { font-size: 12px; }
    .right { text-align:right; }
    .top-chunk { display:flex; justify-content: space-between; gap:12px; align-items: baseline; }
  </style>
</head>
<body>
  <div class="top-chunk">
    <h1>Relatório de Triagem</h1>
    <div class="muted small">Gerado em ${new Date().toLocaleString()}</div>
  </div>

  <h2>Identificação</h2>
  <div class="box">
    <div><strong>Nome:</strong> ${escapeHtml(paciente.nome ?? "—")}</div>
    <div><strong>Idade:</strong> ${escapeHtml(paciente.idade ?? "—")}</div>
    <div><strong>Sexo:</strong> ${escapeHtml(paciente.sexo ?? "—")}</div>
  </div>

  <h2>Via de atendimento</h2>
  <div class="box">
    <div><strong>Via:</strong> ${escapeHtml(outputs?.via ?? "—")}</div>
    <div class="muted small">Motivo: ${escapeHtml(outputs?.via_reason ?? "—")}</div>
  </div>

  <h2>Sintomas & HPI</h2>
  <div class="box">
    <div style="margin-bottom:8px;">
      ${sintomas.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("") || "—"}
    </div>
    <div><strong>HPI:</strong> ${escapeHtml(hpi || "—")}</div>
  </div>

  <h2>Hipóteses (Top 3)</h2>
  <div class="box">
    <table>
      <thead><tr><th>Hipótese</th><th class="right">Prob.</th></tr></thead>
      <tbody>
        ${
          top3
            .map(
              (r) =>
                `<tr><td>${escapeHtml(r.global_id)}</td><td class="right">${fmtPct(
                  r.posterior,
                )}</td></tr>`,
            )
            .join("") || `<tr><td colspan="2">—</td></tr>`
        }
      </tbody>
    </table>
  </div>

  <h2>Alarmes</h2>
  <div class="box">
    ${
      Array.isArray(outputs?.alarmes) && outputs.alarmes.length
        ? outputs.alarmes
            .map((a) => `<span class="chip">${escapeHtml(a)}</span>`)
            .join("")
        : "Sem alarmes identificados."
    }
  </div>

  <p class="small muted" style="margin-top:32px;">
    * Documento gerado automaticamente para apoio clínico. Não substitui avaliação médica presencial.
  </p>

  <script>
    window.onload = () => setTimeout(() => window.print(), 300);
  </script>
</body>
</html>`;
}

/** Abre uma janela com o HTML e chama print (usuário escolhe “Salvar como PDF”). */
export function exportReport({ rawInput, outputs, ranking }) {
  const html = buildHTML({ rawInput, outputs, ranking });
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) {
    // fallback: data URL (caso bloqueio de pop-up)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w2 = window.open(url, "_blank");
    if (!w2) alert("Não foi possível abrir a janela de impressão.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
