/* File: src/core/storage.js
 * Persistência leve de casos:
 * - Browser: localStorage
 * - Node (smoke/teste): fallback em memória
 */

const MEM = new Map();

function hasLocalStorage() {
  try {
    if (typeof window === "undefined" || !("localStorage" in window))
      return false;
    const k = "__ls_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const ls = {
  getItem(k) {
    return hasLocalStorage()
      ? window.localStorage.getItem(k)
      : (MEM.get(k) ?? null);
  },
  setItem(k, v) {
    if (hasLocalStorage()) window.localStorage.setItem(k, v);
    else MEM.set(k, v);
  },
  removeItem(k) {
    if (hasLocalStorage()) window.localStorage.removeItem(k);
    else MEM.delete(k);
  },
};

const PREFIX = "robotto:v1";
const IDX_KEY = `${PREFIX}:cases:index`;

function readIndex() {
  try {
    const raw = ls.getItem(IDX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeIndex(arr) {
  ls.setItem(IDX_KEY, JSON.stringify(arr));
}

export function listCases() {
  return readIndex();
}

export function saveCase(obj) {
  if (!obj || typeof obj !== "object") return false;
  const id = obj.id || String(Date.now());
  const meta = {
    id,
    ts: Date.now(),
    nome: obj?.paciente?.nome ?? null,
    area: obj?.area ?? null,
    via: obj?.outputs?.via ?? null,
  };
  const key = `${PREFIX}:case:${id}`;
  ls.setItem(key, JSON.stringify(obj));
  const idx = readIndex().filter((m) => m.id !== id);
  idx.unshift(meta);
  writeIndex(idx.slice(0, 100)); // limite opcional
  return id;
}

export function loadCase(id) {
  const raw = ls.getItem(`${PREFIX}:case:${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function deleteCase(id) {
  ls.removeItem(`${PREFIX}:case:${id}`);
  writeIndex(readIndex().filter((m) => m.id !== id));
  return true;
}

export function clearAllCases() {
  for (const meta of readIndex()) {
    ls.removeItem(`${PREFIX}:case:${meta.id}`);
  }
  writeIndex([]);
  return true;
}
