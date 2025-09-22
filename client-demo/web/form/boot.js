window.__ensureHomeLink = window.__ensureHomeLink || function(){
  try{
    if (document.getElementById('home-link')) return;
    const h1 = document.querySelector('h1.text-2xl, header h1, h1');
    if (!h1) return;
    const link = document.createElement('a');
    link.id = 'home-link';
    link.className = 'mr-3 text-sm text-blue-600 hover:underline';
    link.href = 'javascript:void(0)';
    link.textContent = '← Accueil';
    link.addEventListener('click', (e)=>{
      e.preventDefault();
      if (history.length > 1) history.back();
      else window.location.href = '../portal/index.html';
    });
    h1.parentElement?.insertBefore(link, h1);
  }catch{}
};
window.setPageTitle = window.setPageTitle || function(res){
  try{
    const f = res?.building?.foundationName || res?.building?.fondation?.name || 'Fondation';
    const b = res?.building?.name || res?.building?.id || '';
    const h1 = document.querySelector('h1.text-2xl, header h1, h1');
    if (h1) h1.textContent = `${f} - ${b}`;
  }catch{}
};

// boot.js — defensive loader with inline diagnostics
const qs = new URLSearchParams(location.search);
const level = (qs.get('level') === 'L2') ? 'L2' : 'L1';
const diagOn = qs.get('diag') === '1';

const diagBox = document.getElementById('diag-overlay');
function diag(...a){ if(!diagOn) return; try{ diagBox.classList.remove('hidden'); diagBox.textContent += a.map(x => typeof x==='string'?x:JSON.stringify(x)).join(' ') + '\n'; }catch{} }
window.__diag = diag;

function showErr(m){
  const box = document.getElementById('boot-error');
  if (!box) return;
  box.textContent = m;
  box.classList.remove('hidden');
  diag('ERROR:', m);
};

try { if (window.AOS) AOS.init({ once: false }); } catch {}

diag('boot.js loaded; level=', level);

// fallback section list helper
function slugify(s) { return (s || '').toString().toLowerCase().trim().replace(/\s+/g, '-'); }
function renderFallbackSections(tpl){
  try{
    const form = document.getElementById('building-form');
    if (form && (!form.firstChild)) {
      const ul = document.createElement('ul');
      ul.className = 'list-disc pl-6 text-gray-700';
      (tpl?.sections || []).forEach(s => {
        const li = document.createElement('li');
        li.textContent = s.title || s.id;
        li.id = slugify(s.title || s.id);
        ul.appendChild(li);
      });
      const box = document.createElement('div');
      box.className = 'bg-white p-4 rounded-lg shadow';
      box.appendChild(ul);
      form.appendChild(box);
      diag('fallback list rendered.');
    }
  }catch(e){ showErr('fallback render error: '+(e?.message||e)); }
};

async function fetchFormDirect(buildingId){
  const url = 'http://localhost:3000/buildings/' + encodeURIComponent(buildingId) + '/form';
  const r = await fetch(url);
  if (!r.ok) throw new Error('direct fetch failed ' + r.status);
  return r.json();
};;

async function main(){
  let api = null;
  try {
    api = (await import('./api.js')).api;
    diag('api.js imported');
  } catch (e) {
    diag('api import failed; will use direct fetch:', e?.message||e);
  }

  let res = null;
  try {
    const buildingId = (new URLSearchParams(location.search)).get('id') || (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
    res = api ? await api.getBuildingForm(buildingId) : await fetchFormDirect(buildingId);
    diag('form fetched; keys=', Object.keys(res||{}));
  } catch (e) {
    showErr('form fetch error: '+(e?.message||e));
    return;
  }

// Merge local draft (per-building, per-level) before initial render
try {
  const bId = (res && res.building && res.building.id) || (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
  const draftKey = `formDraft:${bId}:${level}`;
  const raw = localStorage.getItem(draftKey);
  if (raw) {
    const draft = JSON.parse(raw);
    function deepMerge(a, b) {
      if (!a || typeof a !== 'object') a = {};
      if (!b || typeof b !== 'object') return a;
      const out = Array.isArray(a) ? a.slice() : { ...a };
      for (const [k, v] of Object.entries(b)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          out[k] = deepMerge(a[k] || {}, v);
        } else {
          out[k] = v;
        }
      }
      return out;
    }
    res.data = deepMerge(res.data || {}, draft);
  }
} catch {}
/*__BASELINE_INSERT__*/
// Set review baseline from last PUBLISHED snapshot (server committed), not working/draft
try {
  const bId = (res && res.building && res.building.id) || (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
  const reviewMeta = await api.getReview(bId, res && res.dataVersion);
  window.__lastPublishedSnapshot = JSON.parse(JSON.stringify(reviewMeta?.committed || {}));
} catch {}
// Keep a snapshot of the data that the form is rendered with
try { window.__renderedData = JSON.parse(JSON.stringify(res.data || {})); } catch {}
renderFallbackSections(res.template);
  try { window.__template = res.template; } catch {}
  try { const v = document.getElementById('data-version'); if (v && window.__buildingMeta?.dataVersion) v.textContent = 'v'+String(window.__buildingMeta.dataVersion); } catch {}
  try { window.__template = res.template; } catch {}

  let renderForm = null;
  try {
    renderForm = (await import('./renderer.js')).renderForm;
    diag('renderer.js imported');
  } catch (e) {
    showErr('renderer import error: '+(e?.message||e));
    return;
  }

  // chips and scrollspy helpers
  function preciseScrollTo(el) {
    const headerOffset = 100;
    const top = el.getBoundingClientRect().top + window.pageYOffset - headerOffset;
    window.scrollTo({ top, behavior: 'smooth' });
  }
  function setupChips(template) {
    const chips = document.getElementById('chips');
    chips.innerHTML = '';
    (template.sections || []).forEach(sec => {
      const a = document.createElement('a');
      a.href = '#' + slugify(sec.title || sec.id);
      a.className = 'px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm whitespace-nowrap chip';
      a.textContent = sec.title;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const el = document.getElementById(slugify(sec.title || sec.id));
        if (!el) return;
        const content = el.querySelector('.section-content');
        if (content && content.style.display === 'none') content.style.display = '';
        preciseScrollTo(el);
        if (window.feather) window.feather.replace();
      });
      chips.appendChild(a);
    });
  }
  function setupScrollSpy() {
    const chips = Array.from(document.querySelectorAll('#chips .chip'));
    const sections = Array.from(document.querySelectorAll('section.form-section'));
    const map = new Map();
    chips.forEach((chip) => {
      const href = chip.getAttribute('href') || '';
      if (href.startsWith('#')) map.set(href.substring(1), chip);
    });
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const chip = map.get(id);
        if (!chip) return;
        if (entry.isIntersecting) {
          chips.forEach(c => c.classList.remove('bg-blue-100','text-blue-800'));
          chips.forEach(c => c.classList.add('bg-gray-100','text-gray-600'));
          chip.classList.remove('bg-gray-100','text-gray-600');
          chip.classList.add('bg-blue-100','text-blue-800');
        }
      });
    }, { rootMargin: '-120px 0px -70% 0px', threshold: [0.2, 0.6] });
    sections.forEach(s => obs.observe(s));
  }

  try {
    renderForm({ template: res.template, data: res.data, level, onChange: ()=>{} });
    setupChips(res.template);
    setupScrollSpy();
    if (window.feather) window.feather.replace();
    diag('renderForm completed.');
  } catch (e) {
    showErr('renderForm error: ' + (e?.message||e));
  } finally {
    const marker = document.getElementById('boot-marker');
    if (marker) marker.remove();
  }
};

main().catch(e => showErr('boot main crash: '+(e?.message||e)));

window.setPageTitle = window.setPageTitle || function(res){
  try{
    const el = document.getElementById('page-title'); if(!el) return;
    const f = res?.building?.foundationName || res?.building?.fondation?.name || 'Fondation';
    const b = res?.building?.name || res?.building?.id || '';
    el.textContent = `${f} - ${b}`;
  }catch{}
};
