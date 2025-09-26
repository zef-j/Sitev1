/**
 * progress.js — Phase 1
 * Compute progress for L1 and L2 using only VISIBLE fields.
 */
import { getAtPath } from './state.js';
import { isFieldVisible } from './visibility.js';

function isDecorative(field){ return field?.type==='subtitle' || field?.containsData===false; }

export function isCompleteValue(field, value) {
  if (value === null || value === undefined) return false;
  switch(field.type) {
    case 'text':
    case 'textarea':
    case 'date':
      return String(value).trim() !== '';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'select':
      return String(value).trim() !== '' && value !== 'Sélectionner';
    case 'file':
      return typeof value === 'object' ? !!(value.name || value.url) : String(value).trim() !== '';
    case 'monthTable':
    case 'yearTable':
      return !!value && typeof value === 'object' && Object.values(value).some(v => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)));
    case 'bool':
      return typeof value === 'boolean';
    default:
      return String(value).trim() !== '';
  }
}

function listFields(template) {
  const arr = [];
  (template.sections || []).forEach(sec => {
    (sec.subsections || []).forEach(sub => {
      (sub.fields || []).forEach(field => {
        arr.push({ path: `${sec.id}.${sub.id}.${field.id}`, sec, sub, field });
      });
    });
  });
  return arr;
}

export function computeProgress(template, data, level='L1') {
  if (!template) return { overall: 0, L1: 0, L2: 0 };
  const fields = listFields(template);
  const visible = fields.filter(({field}) => isFieldVisible(field, data, level) && !isDecorative(field));

  function stats(levelMode) {
    const subset = visible.filter(({field}) => {
      const fLevel = field.level || 'BOTH';
      if (levelMode === 'L1') return fLevel === 'L1' || fLevel === 'BOTH';
      if (levelMode === 'L2') return fLevel === 'L2';
      return true;
    });
    const total = subset.length;
    let done = 0;
    subset.forEach(({path, field}) => {
      const v = getAtPath(data, path);
      if (isCompleteValue(field, v)) done += 1;
    });
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }

  const s1 = stats('L1');
  const s2 = stats('L2');
  if (level === 'L1') return { overall: s1.pct, L1: s1.pct, L2: 0 };
  // For display we keep overall = L1% (as agreed); stacked visual later
  return { overall: s1.pct, L1: s1.pct, L2: s2.pct };
}
