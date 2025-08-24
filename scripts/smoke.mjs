// File: scripts/smoke.js
// Usa o triageEngine via Node, ajustando fetch para apontar para BASE_URL.

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:5500').replace(/\/$/, '');
const mode = process.argv.includes('--always') ? 'always' : 'gated';

// Wrap em fetch: transforma "/src/..." em "http://127.0.0.1:5500/src/..."
const origFetch = globalThis.fetch;
if (typeof origFetch !== 'function') {
  throw new Error('Este script requer Node 18+ (fetch nativo).');
}
globalThis.fetch = (input, init) => {
  let url = input;
  if (typeof url === 'string' && url.startsWith('/')) {
    url = BASE + url;
  }
  return origFetch(url, init);
};

(async () => {
  try {
    const { triage, explainTop } = await import('../src/core/triageEngine.js');
    const { loadRegistry } = await import('../src/core/conditionRegistry.js');

    // Caso de teste multiárea (nasofaringite)
    const raw = {
      symptoms: ['rinorreia','obstrucao_nasal','odinofagia','plenitude_auricular','linfonodo_cervical_aumentado'],
      idade: 28,
      sexo: 'F',
      hpi: 'Há 3 dias: coriza, leve dor de garganta, ouvido tampado.'
    };

    const res = await triage(raw, { mode });
    const registry = await loadRegistry();

    const top3 = res.ranking.slice(0, 3).map(r => ({
      global_id: r.global_id,
      posterior: +r.posterior.toFixed(3)
    }));

    console.log('=== ROBOTTO Smoke Test ===');
    console.log('BASE_URL  :', BASE);
    console.log('Router    :', mode);
    console.log('Áreas     :', res.areas.join(', '));
    console.log('Top-1     :', explainTop(res.ranking, registry));
    console.log('Top-3     :', top3);
    console.log('Via       :', res.outputs.via);
    console.log('Alarmes   :', res.outputs.alarmes);
    console.log('Resumo    :', res.outputs.resumo);
  } catch (err) {
    console.error('[Smoke Error]', err);
    process.exit(1);
  }
})();
