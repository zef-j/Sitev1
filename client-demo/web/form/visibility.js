/**
 * visibility.js — Phase 1 rules engine
 * L1 and L2 currently see the SAME fields (level gating off).
 */
export function getAtPath(obj, path) {
  try {
    return path.split('.').reduce((o, k) => (o && Object.prototype.hasOwnProperty.call(o, k)) ? o[k] : undefined, obj);
  } catch { return undefined; }
}

function cmpNum(a, b, op) {
  const na = Number(a), nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  switch (op) {
    case 'gt': return na > nb;
    case 'gte': return na >= nb;
    case 'lt': return na < nb;
    case 'lte': return na <= nb;
    default: return false;
  }
}

export function evalSingle(rule, data) {
  if (!rule) return true;
  const val = getAtPath(data, rule.when);
  if ('eq' in rule) return val === rule.eq;
  if ('ne' in rule) return val !== rule.ne;
  if ('in' in rule) return Array.isArray(rule.in) ? rule.in.includes(val) : false;
  if ('nin' in rule) return Array.isArray(rule.nin) ? !rule.nin.includes(val) : true;
  if ('gt' in rule) return cmpNum(val, rule.gt, 'gt');
  if ('gte' in rule) return cmpNum(val, rule.gte, 'gte');
  if ('lt' in rule) return cmpNum(val, rule.lt, 'lt');
  if ('lte' in rule) return cmpNum(val, rule.lte, 'lte');
  if ('truthy' in rule) return !!val;
  if ('falsy' in rule) return !val;
  return true;
}

export function evalRule(rule, data) {
  if (!rule) return true;
  if (rule.allOf) return rule.allOf.every(r => evalRule(r, data));
  if (rule.anyOf) return rule.anyOf.some(r => evalRule(r, data));
  if (rule.not) return !evalRule(rule.not, data);
  return evalSingle(rule, data);
}

function levelAllows(field, level) {
  // Phase-1: no level filtering (L1 == L2)
  return true;
}

export function isFieldVisible(field, data, level) {
  if (!levelAllows(field, level)) return false;
  const rules = field.visibilityRules || [];
  try {
    return rules.length ? rules.every(r => evalRule(r, data)) : true;
  } catch (e) {
    console.warn('[visibility] bad rule on field', field?.id, e);
    return true;
  }
}
