/**
 * progress.js — Robust progress computation
 * - Counts ONLY visible fields, based on visibility rules.
 * - Handles conditional branches naturally (only the shown branch contributes).
 * - Works with BOTH call signatures:
 *     computeProgress(template, data, level)
 *     computeProgress({ template, data, level })
 */
import { getAtPath } from './state.js';
import { isFieldVisible } from './visibility.js';

function isDecorative(field){
  return field?.type === 'subtitle' || field?.containsData === false;
}

export function isCompleteValue(field, value) {
  if (value === null || value === undefined) return false;

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'date':
      return String(value).trim() !== '';

    case 'number':
      return value !== '' && !Number.isNaN(Number(value));

    case 'select':
      // treat empty string / null as incomplete
      return String(value).trim() !== '';

    case 'file':
      // value could be a string (url) or an object with metadata
      if (typeof value === 'string') return value.trim() !== '';
      if (typeof value === 'object') {
        const { url, path, filename, originalname, uploadedAt } = value;
        return Boolean(url || path || filename || originalname || uploadedAt);
      }
      return false;

    case 'monthTable': {
      // Expect 12 months; count complete if every visible cell has a numeric value
      const months = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
      if (!value || typeof value !== 'object') return false;
      return months.every(m => value[m] !== null && value[m] !== undefined && !Number.isNaN(Number(value[m])));
    }

    case 'yearTable': {
      // If template specifies years, require all of them. Otherwise require at least one numeric entry.
      const years = Array.isArray(field.years) && field.years.length ? field.years.map(String) : null;
      if (!value || typeof value !== 'object') return false;
      if (years) return years.every(y => value[y] !== null && value[y] !== undefined && !Number.isNaN(Number(value[y])));
      // fallback: at least one key with a numeric value
      return Object.values(value).some(v => v !== null && v !== undefined && !Number.isNaN(Number(v)));
    }

    default:
      // Fallback: consider non-empty values complete
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object') return Object.keys(value).length > 0;
      return Boolean(value);
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

export function computeProgress(arg1, arg2, arg3) {
  // Normalize arguments
  let template, data, level;
  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1) && (arg1.template || arg1.data)) {
    template = arg1.template;
    data = arg1.data;
    level = arg1.level || 'L1';
  } else {
    template = arg1;
    data = arg2;
    level = arg3 || 'L1';
  }

  function stats(forLevel) {
    const fields = listFields(template);
    // Only fields that are (a) not decorative and (b) currently visible under data/level
    const subset = fields.filter(({ field }) => !isDecorative(field) && isFieldVisible(field, data, forLevel));

    const total = subset.length;
    let done = 0;
    subset.forEach(({ path, field }) => {
      const v = getAtPath(data, path);
      if (isCompleteValue(field, v)) done += 1;
    });

    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }

  const s1 = stats('L1');
  const s2 = stats('L2');
  if (level === 'L1') return { overall: s1.pct, L1: s1.pct, L2: 0 };
  // For display we keep overall = L1% (as agreed); stacked visual could show L2 separately
  return { overall: s1.pct, L1: s1.pct, L2: s2.pct };
}
