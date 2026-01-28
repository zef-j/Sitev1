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
  const pick = (key) => {
    if (rule.when) return { when: rule.when, value: rule[key] };
    const raw = rule[key];
    if (Array.isArray(raw) && raw.length >= 2) return { when: raw[0], value: raw[1] };
    return null;
  };
  const eq = pick('eq');
  if (eq) {
    const val = getAtPath(data, eq.when);
    return val === eq.value;
  }
  const ne = pick('ne');
  if (ne) {
    const val = getAtPath(data, ne.when);
    return val !== ne.value;
  }
  if ('in' in rule) {
    const val = getAtPath(data, rule.when || '');
    if (!rule.when && Array.isArray(rule.in) && rule.in.length >= 2 && Array.isArray(rule.in[1])) {
      const v = getAtPath(data, rule.in[0]);
      return rule.in[1].includes(v);
    }
    return Array.isArray(rule.in) ? rule.in.includes(val) : false;
  }
  if ('nin' in rule) {
    const val = getAtPath(data, rule.when || '');
    if (!rule.when && Array.isArray(rule.nin) && rule.nin.length >= 2 && Array.isArray(rule.nin[1])) {
      const v = getAtPath(data, rule.nin[0]);
      return !rule.nin[1].includes(v);
    }
    return Array.isArray(rule.nin) ? !rule.nin.includes(val) : true;
  }
  const gt = pick('gt');
  if (gt) return cmpNum(getAtPath(data, gt.when), gt.value, 'gt');
  const gte = pick('gte');
  if (gte) return cmpNum(getAtPath(data, gte.when), gte.value, 'gte');
  const lt = pick('lt');
  if (lt) return cmpNum(getAtPath(data, lt.when), lt.value, 'lt');
  const lte = pick('lte');
  if (lte) return cmpNum(getAtPath(data, lte.when), lte.value, 'lte');
  if ('truthy' in rule) {
    const when = rule.when || (Array.isArray(rule.truthy) ? rule.truthy[0] : rule.truthy);
    const val = getAtPath(data, when || '');
    return !!val;
  }
  if ('falsy' in rule) {
    const when = rule.when || (Array.isArray(rule.falsy) ? rule.falsy[0] : rule.falsy);
    const val = getAtPath(data, when || '');
    return !val;
  }
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
  const raw = field.visibilityRules;
  const rules = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);
  try {
    return rules.length ? rules.every(r => evalRule(r, data)) : true;
  } catch (e) {
    console.warn('[visibility] bad rule on field', field?.id, e);
    return true;
  }
}
