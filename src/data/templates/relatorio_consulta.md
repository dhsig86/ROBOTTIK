import { renderReportMarkdown } from './src/core/caseBuilder.js';

const tpl = await (await fetch('/src/data/templates/relatorio_consulta.md')).text();
const md = renderReportMarkdown({ outputs: result.outputs, ranking: result.ranking, registry, templateText: tpl });
console.log(md);
