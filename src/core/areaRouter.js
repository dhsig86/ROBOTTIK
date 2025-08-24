/* File: src/core/areaRouter.js
 * Seleciona quais áreas devem rodar, baseado no intake presente e/ou modo configurado.
 * - mode: 'always' | 'gated'
 *   - 'always': roda todas as áreas
 *   - 'gated' : roda apenas áreas com pelo menos 1 sintoma daquela área presente no intake
 *
 * Requer o 'registry' carregado (para saber quais features pertencem ao intake de cada área).
 */

export const ALL_AREAS = ["ouvido", "nariz", "garganta", "pescoco"];

/**
 * intake: { symptoms: Set<string> | string[] }  // ids canônicos presentes
 */
export function selectAreas(intake, { mode = "gated", registry } = {}) {
  const present = new Set(
    Array.isArray(intake?.symptoms) ? intake.symptoms : (intake?.symptoms instanceof Set ? Array.from(intake.symptoms) : [])
  );

  if (mode === "always" || !registry) {
    return ALL_AREAS.slice();
  }

  const picked = [];
  for (const area of ALL_AREAS) {
    const areaBundle = registry.byArea?.[area];
    if (!areaBundle) continue;
    const areaFeatures = (areaBundle.intake?.symptoms || []).map(s => s.id).filter(Boolean);
    const hasSignal = areaFeatures.some(fid => present.has(fid));
    if (hasSignal) picked.push(area);
  }

  // fallback: se nada foi selecionado no modo 'gated', rode tudo (não queremos perder casos leves)
  return picked.length ? picked : ALL_AREAS.slice();
}
