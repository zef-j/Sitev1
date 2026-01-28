// i18n.js — single-definition, external-JSON-enabled i18n

const LANGS = ['fr','de','en'];
const DEFAULT_LANG = 'fr';

export function getLang(){
  try { return localStorage.getItem('lang') || DEFAULT_LANG; } catch { return DEFAULT_LANG; }
}
export function setLang(lang){
  if (!LANGS.includes(lang)) lang = DEFAULT_LANG;
  try { localStorage.setItem('lang', lang); } catch {}
  window.__lang = lang;
  document.documentElement.setAttribute('lang', lang);
  window.dispatchEvent(new Event('langchange'));
}

// Base in-memory dictionary (UI + months). Template keys will be merged from JSONs.
const dict = {
  fr: {
    'ui.progress':'Progression','ui.review':'Revue','ui.publish':'Sauvegarder','ui.save':'Sauvegarder',
    'ui.download':'Télécharger',
    'ui.downloadAllData':'Télécharger toutes les données',
    'ui.foundations':'Fondations','ui.foundation':'Fondation','ui.completedTotal':'Total complété:',
    'ui.select':'Sélectionner','ui.chooseFile':'Choisir un fichier','ui.backHome':'← Accueil',
    'months.jan':'Janvier','months.feb':'Février','months.mar':'Mars','months.apr':'Avril','months.may':'Mai','months.jun':'Juin','months.jul':'Juillet','months.aug':'Août','months.sep':'Septembre','months.oct':'Octobre','months.nov':'Novembre','months.dec':'Décembre',
  },
  de: {
    'ui.progress':'Fortschritt','ui.review':'Review','ui.publish':'Speichern','ui.save':'Speichern',
    'ui.download':'Herunterladen',
    'ui.downloadAllData':'Alle Daten herunterladen',
    'ui.foundations':'Stiftungen','ui.foundation':'Stiftung','ui.completedTotal':'Insgesamt abgeschlossen:',
    'ui.select':'Auswählen','ui.chooseFile':'Datei wählen','ui.backHome':'← Startseite',
    'months.jan':'Januar','months.feb':'Februar','months.mar':'März','months.apr':'April','months.may':'Mai','months.jun':'Juni','months.jul':'Juli','months.aug':'August','months.sep':'September','months.oct':'Oktober','months.nov':'November','months.dec':'Dezember',
  },
  en: {
    'ui.progress':'Progress','ui.review':'Review','ui.publish':'Save','ui.save':'Save',
    'ui.download':'Download',
    'ui.downloadAllData':'Download all data',
    'ui.foundations':'Foundations','ui.foundation':'Foundation','ui.completedTotal':'Total completed:',
    'ui.select':'Select','ui.chooseFile':'Choose file','ui.backHome':'← Home',
    'months.jan':'January','months.feb':'February','months.mar':'March','months.apr':'April','months.may':'May','months.jun':'June','months.jul':'July','months.aug':'August','months.sep':'September','months.oct':'October','months.nov':'November','months.dec':'December',
  }
};

export function t(key, fallback=''){
  const lang = window.__lang || getLang();
  const pack = dict[lang] || {};
  return (key in pack) ? pack[key] : fallback;
}

export function translatePage(root = document){
  try{
    const nodes = Array.from(root.querySelectorAll('[data-i18n]'));
    nodes.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const fb = el.getAttribute('data-i18n-fallback') ?? el.textContent;
      el.textContent = t(key, fb);
    });
  }catch{}
}

export function ensureLangSelector(container){
  try{
    if (!container) container = document.querySelector('header .container .flex') || document.body;
    if (!container || document.getElementById('lang-select')) return;
    const wrap = document.createElement('div');
    wrap.className = 'ml-2';
    const sel = document.createElement('select');
    sel.id = 'lang-select';
    sel.className = 'border rounded px-2 py-1 text-sm';
    [{v:'fr',l:'FR'},{v:'de',l:'DE'},{v:'en',l:'EN'}].forEach(o => {
      const op = document.createElement('option'); op.value=o.v; op.textContent=o.l; sel.appendChild(op);
    });
    sel.value = getLang();
    sel.addEventListener('change', e => setLang(e.target.value));
    wrap.appendChild(sel); container.appendChild(wrap);
  }catch{}
}

// Helpers for months: keep FR keys internally; display follows language
export function monthKeys(){ return ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']; }
export function monthLabels(lang = (window.__lang || getLang())){
  const k = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return k.map(code => t('months.'+code, code));
}

/* ---------- External JSON loader (single definition) ---------- */

let __i18nBase = null;
export function setI18nBase(path){ try{ __i18nBase = path && String(path); }catch{} }

function fetchCandidates(lang){
  // build a minimal list of bases: explicit override first, then absolute /i18n/
  const bases = [];
  try { if (__i18nBase && typeof __i18nBase === 'string') bases.push(__i18nBase); } catch {}
  bases.push('/i18n/');
  // de-duplicate
  const seen = new Set();
  const uniq = bases.filter(b => (b && (seen.has(b) ? false : (seen.add(b), true))));
  return uniq.map(b => (b.endsWith('/')?b:b+'/') + lang + '.json');
}

async function tryFetch(url){
  try{
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  }catch{ return null; }
}

export async function loadExternalTranslations(lang){
  const urls = fetchCandidates(lang);
  for (const u of urls){
    const j = await tryFetch(u);
    if (j){
      const payload = j[lang] && typeof j[lang] === 'object' ? j[lang] : j;
      dict[lang] = { ...(payload||{}), ...(dict[lang]||{}) };
      try{ console.debug('[i18n] loaded', lang, 'from', u, 'keys=', Object.keys(payload||{}).length); }catch{}
      return; // stop after the first successful load
    }
  }
  try{ if (window.__I18N_DIAG) { console.warn('[i18n] failed to load', lang, 'from', urls); } }catch{}
}

export async function initI18n(){
  const lang = getLang();
  await loadExternalTranslations(lang);
  window.__lang = lang;
  document.documentElement.setAttribute('lang', lang);
  translatePage(document);
}

window.addEventListener('langchange', async ()=>{
  await loadExternalTranslations(window.__lang || getLang());
  translatePage(document);
});
