/* Armazena e deduplica evidências por featureId canônico.
 * Mantém proveniência (source) e valor/metadados opcionais.
 */
export function createEvidenceStore() {
  const map = new Map(); // featureId -> { featureId, sources: Set, value, meta }

  function ensure(featureId) {
    if (!map.has(featureId)) {
      map.set(featureId, { featureId, sources: new Set(), value: true, meta: {} });
    }
    return map.get(featureId);
  }

  return {
    add({ featureId, source = "user", value = true, meta = {} }) {
      if (!featureId) return;
      const slot = ensure(featureId);
      slot.sources.add(source);
      if (value !== undefined && value !== null) slot.value = value;
      Object.assign(slot.meta, meta || {});
    },
    addMany(items = []) { for (const it of items) this.add(it); },
    merge(otherStore) {
      for (const rec of otherStore.list()) {
        this.add({ featureId: rec.featureId, source: [...rec.sources][0] || "merge", value: rec.value, meta: rec.meta });
      }
    },
    has(featureId) { return map.has(featureId); },
    get(featureId) { return map.get(featureId) || null; },
    list() {
      return Array.from(map.values()).map(v => ({ ...v, sources: new Set(v.sources) }));
    },
    toJSON() {
      return this.list().map(v => ({
        featureId: v.featureId,
        sources: Array.from(v.sources),
        value: v.value,
        meta: v.meta,
      }));
    },
    clear() { map.clear(); },
  };
}
