import { triage, explainTop } from './src/core/triageEngine.js';
import { loadRegistry } from './src/core/conditionRegistry.js';

(async () => {
  const raw = {
    symptoms: ['rinorreia','obstrucao_nasal','odinofagia','plenitude_auricular','linfonodo_cervical_aumentado'],
    idade: 28,
    sexo: 'F',
    hpi: 'Quadro iniciado há 3 dias, coriza, leve dor de garganta, ouvido tampado.'
  };
  const result = await triage(raw, { mode: 'gated' });
  const registry = await loadRegistry();

  console.log('Áreas rodadas:', result.areas);
  console.log('Top-1:', explainTop(result.ranking, registry));
  console.log('Outputs:', result.outputs);
})();