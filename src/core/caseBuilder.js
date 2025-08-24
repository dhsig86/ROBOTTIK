/* File: src/core/caseBuilder.js
 * Constrói os 4 outputs clínicos (resumo, alarmes, cuidados, via)
 * e pode renderizar um relatório Markdown usando template.
 */

/** severidade (maior = mais urgente) */
const VIA_RANK = {
  emergencia_especializada: 4,
  emergencia_geral: 3,
  telemedicina: 2,
  ambulatorio_rotina: 1,
};

function pickWorstRoute(routes = []) {
  let best = { route: "ambulatorio_rotina", rank: 1 };
  for (const r of routes) {
    const rk = VIA_RANK[r] || 1;
    if (rk > best.rank) best = { route: r, rank: rk };
  }
  return best.route;
}

function collectAreaRoutes(registry, areas) {
  const map = {};
  for (const area of areas) {
    const va = registry.byArea?.[area]?.via_atendimento || {};
    for (const [flagId, route] of Object.entries(va)) {
      map[flagId] = route;
    }
  }
  return map;
}

function featuresToLabels(ids, registry) {
  return Array.from(ids).map((id) => registry.featuresMap[id]?.label || id);
}

/** sugestões básicas por top-1 (pode evoluir via templates por dx) */
function suggestCare(topGlobalId) {
  const commons = [
    "Hidratação adequada e repouso relativo.",
    "Analgésicos/antitérmicos conforme necessidade e alergias.",
    "Evitar automedicação antibiótica."
  ];
  if (!topGlobalId) return commons;

  const gid = String(topGlobalId);
  if (gid.includes("rinite") || gid.includes("nasofaringite")) {
    return commons.concat([
      "Lavagem nasal com solução salina 2–3x/dia.",
      "Cabeceira levemente elevada para dormir."
    ]);
  }
  if (gid.includes("otite_externa")) {
    return commons.concat([
      "Evitar água no conduto até avaliação.",
      "Não usar cotonetes/objetos no ouvido."
    ]);
  }
  if (gid.includes("lpr") || gid.includes("refluxo")) {
    return commons.concat([
      "Evitar refeições volumosas à noite; elevar cabeceira.",
      "Reduzir alimentos gatilho (gordura, álcool, café) se aplicável."
    ]);
  }
  return commons;
}

/**
 * @param {Object} params
 * @param {Object} params.rawInput
 * @param {Set<string>} params.intakeSet
 * @param {Object} params.registry
 * @param {string[]} params.areas
 * @param {Array} params.ranking
 */
export function buildOutputs({ rawInput, intakeSet, registry, areas, ranking }) {
  const resumo = {
    paciente: {
      nome: rawInput?.paciente_nome || null,
      idade: rawInput?.idade ?? null,
      sexo: rawInput?.sexo ?? null,
    },
    sintomas: featuresToLabels(intakeSet, registry),
    hpi: rawInput?.hpi || rawInput?.queixa || rawInput?.text || null,
  };

  const viaMap = collectAreaRoutes(registry, areas);
  const presentFlags = [];
  const routesHit = [];
  for (const flagId of Object.keys(viaMap)) {
    if (intakeSet.has(flagId)) {
      presentFlags.push(flagId);
      routesHit.push(viaMap[flagId]);
    }
  }
  const via = pickWorstRoute(routesHit);
  const alarmes = presentFlags.map((id) => registry.featuresMap[id]?.label || id);

  const top = Array.isArray(ranking) && ranking.length ? ranking[0] : null;
  const cuidados = suggestCare(top?.global_id);

  return { resumo, alarmes, cuidados, via };
}

/** renderiza relatório Markdown usando template */
export function renderReportMarkdown({ outputs, ranking, registry, templateText }) {
  function bullets(arr) {
    if (!arr || !arr.length) return "- (sem itens)\n";
    return arr.map((x) => `- ${x}`).join("\n") + "\n";
  }
  const paciente = outputs.resumo.paciente || {};
  const top3 = (ranking || []).slice(0, 3).map((r) => {
    const label =
      registry?.byGlobalId?.[r.global_id]?.entries?.[0]?.label ||
      r.global_id;
    const pct = Math.round((r.posterior || 0) * 100);
    return `- ${label}: ~${pct}%`;
  }).join("\n");

  let md = String(templateText || "");
  md = md.replace(/{{\s*nome\s*}}/g, paciente.nome ?? "");
  md = md.replace(/{{\s*idade\s*}}/g, paciente.idade ?? "");
  md = md.replace(/{{\s*sexo\s*}}/g, paciente.sexo ?? "");
  md = md.replace(/{{\s*hpi\s*}}/g, outputs.resumo.hpi ?? "");
  md = md.replace(/{{\s*via\s*}}/g, outputs.via ?? "");
  md = md.replace(/{{\s*sintomas\s*}}/g, "\n" + bullets(outputs.resumo.sintomas));
  md = md.replace(/{{\s*alarmes\s*}}/g, "\n" + bullets(outputs.alarmes));
  md = md.replace(/{{\s*cuidados\s*}}/g, "\n" + bullets(outputs.cuidados));
  md = md.replace(/{{\s*hipoteses\s*}}/g, "\n" + (top3 || "- (sem hipóteses)\n"));
  return md;
}
