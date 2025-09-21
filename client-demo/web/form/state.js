/**
 * state.js — helpers for the canonical data shape
 * Shape: { sectionId: { subsectionId: { fieldId: value } } }
 */
export function getAtPath(obj, path) {
  return path.split('.').reduce((o, k) => (o && Object.prototype.hasOwnProperty.call(o, k)) ? o[k] : undefined, obj);
}

export function setAtPath(obj, path, value) {
  const ks = path.split('.');
  let cur = obj;
  for (let i=0;i<ks.length-1;i++) {
    const k = ks[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[ks[ks.length-1]] = value;
  return obj;
}

export function clone(obj) {
  try { return structuredClone(obj); } catch { return JSON.parse(JSON.stringify(obj)); }
}
