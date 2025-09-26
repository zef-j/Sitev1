
// Expose current form context for Phase 2 (diff & publish)
let __formCtx = { template: null, data: {}, level: 'L1' };
export function getCurrentFormContext(){ return __formCtx; }

// renderer.js — Hotfix: no 'or', scoped rapport logic, template-first elsewhere.
// Keeps look & AOS/feather behavior the same; uses inline display toggling.

import { isFieldVisible } from './visibility.js';
import { getAtPath, setAtPath, clone } from './state.js';
import { computeProgress } from './progress.js';
import { api } from './api.js';

// File upload handler (no visual change)
async function handleFileUpload(ev, fieldPath) {
  const input = ev.target;
  const file = input && input.files && input.files[0];
  if (!file) return;
  const id = (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
  try {
    const res = await api.uploadFile(id, fieldPath, file);
    setAtPath(__formCtx.data, fieldPath, (res && res.file) ? res.file : null);
    // show a small filename under the control
    const noteId = (fieldPath.replace(/[^a-zA-Z0-9_-]/g,'__')) + '_fname';
    let note = document.getElementById(noteId);
    if (!note && input && input.parentElement) {
      note = document.createElement('div');
      note.id = noteId;
      note.className = 'text-xs text-gray-600 mt-1';
      input.parentElement.appendChild(note);
    }
    if (note) note.textContent = (res && res.file && res.file.originalName) ? res.file.originalName : file.name;
  } catch (e) {
    console.warn('upload failed', e);
    alert('Échec du téléversement.');
  } finally {
    if (input) input.value = '';
  }
}


// Allow rapport behavior ONLY in these subsections
const ALLOWED_RAPPORT = new Set([
  'incendie',
  'amiante',
  'maintenance-et-entretient',
  'etude-sismique',         // Étude sismique (id réel du template)
  'accessibilite-handicap', // Accessibilité (id réel du template)
  'enveloppe-batiment'      // CECB (cas spécial)
]);
// Simple ASCII regexes to avoid encoding issues
const RX_RAPPORT = /(?:^|[\s\-_])rapport(?:[\s\-_]|$)/i;
const RX_UPLOAD  = /(upload|televers|fichier)/i;

const DEFAULT_SELECT = ["Oui","Non","NSP"];

function stripAccents(s) { try { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch { return s; } }
const ICONS = { incendie:'flame', fire:'flame', amiante:'shield', asbestos:'shield', pv:'sun', photovoltaique:'sun', production:'sun', consommation:'bar-chart-2', energie:'zap', accessibilite:'users', autre:'more-horizontal' };
function normalizeIcon(name, fallback) { const key = stripAccents(String(name||'').toLowerCase()); return ICONS[key] || fallback || 'folder'; }

export function renderForm({ template, data, level='L1', onChange=()=>{} }) {
  const form = document.getElementById('building-form'); if (!form) return; form.innerHTML = '';
  const state = clone(data || {}); let progressTimer = 0;
  const slug = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g,'-');

  (template.sections || []).forEach((section) => {
    const secId = slug(section.title || section.id);
    const secEl = document.createElement('section');
    secEl.id = secId;
    secEl.className = 'form-section bg-white rounded-xl shadow-md overflow-hidden';
    secEl.setAttribute('data-aos','fade-up');
    secEl.innerHTML = `
      <div class="section-header bg-blue-50 px-6 py-4 border-b flex justify-between items-center cursor-pointer">
        <h2 class="text-xl font-semibold text-blue-800 flex items-center">
          <i data-feather="${normalizeIcon(section.icon,'folder')}" class="mr-2"></i>${section.title || section.id}
        </h2>
        <i data-feather="chevron-down" class="text-blue-600 toggle-icon"></i>
      </div>
      <div class="section-content px-6 py-6"></div>`;
    const content = secEl.querySelector('.section-content');

    (section.subsections || []).forEach((sub) => {
      const wrap = document.createElement('div'); wrap.className = 'mb-8';
      wrap.innerHTML = `<h3 class="text-lg font-medium text-gray-800 mb-4 flex items-center">
          <i data-feather="${normalizeIcon(sub.icon,'layers')}" class="mr-2"></i>${sub.title || sub.id}</h3>`;
      const grid = document.createElement('div'); grid.className = 'grid md:grid-cols-2 gap-6 ml-6';
      wrap.appendChild(grid); content.appendChild(wrap);

      (sub.fields || []).forEach((field) => {
        const fieldPath = `${section.id}.${sub.id}.${field.id}`;
        const fieldEl = renderField(field, getAtPath(state, `${section.id}.${sub.id}`), (value) => {
          const _curVal = getAtPath(state, fieldPath);
const _nextVal = (typeof value === 'function') ? value(_curVal) : value;
setAtPath(state, fieldPath, _nextVal);
updateVisibilityForSubsection(secEl, section, sub, state);
          scheduleProgress();
          onChange(clone(state));
        });
        fieldEl.dataset.fieldPath = fieldPath;
        try { fieldEl.setAttribute('data-fieldpath', fieldPath); } catch {}
grid.appendChild(fieldEl);
      });
    });

    secEl.querySelector('.section-header')?.addEventListener('click', () => {
      const c = secEl.querySelector('.section-content'); if (!c) return;
      c.style.display = (c.style.display === 'none') ? '' : 'none';
      if (window.AOS && (AOS.refreshHard || AOS.refresh)) setTimeout(() => (AOS.refreshHard ? AOS.refreshHard() : AOS.refresh()), 30);
      if (window.feather) window.feather.replace();
    });

    form.appendChild(secEl);
  });

  // first pass visibility
  document.querySelectorAll('section.form-section').forEach((secEl) => {
    const id = secEl.id;
    const section = (template.sections || []).find(s => slug(s.title || s.id) === id);
    if (!section) return;
    (section.subsections || []).forEach(sub => updateVisibilityForSubsection(secEl, section, sub, state));
  });
  if (window.feather) window.feather.replace();
  scheduleProgress();

  function scheduleProgress() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(() => {
      const seg = computeProgress(template, state, level);
      const bar = document.getElementById('progress-bar');
      if (bar) { bar.style.width = (seg.overall || 0) + '%'; bar.title = level==='L2' ? `L1 ${seg.L1}% • L2 ${seg.L2}%` : `${seg.L1}%`; }
      const readout = document.getElementById('progress-readout');
      if (readout) readout.textContent = (level==='L2') ? `L1 ${seg.L1}% • L2 ${seg.L2}%` : `${seg.L1}%`;
      const bar2 = document.getElementById('progress-bar-l2');
      if (bar2) { bar2.style.width = (seg.L2 || 0) + '%'; }
      __formCtx = { template, data: state, level };
    }, 40);
  }

  function normOuiNon(v) {
    const s = (v === true || v === false) ? v : String(v || '').trim().toLowerCase();
    if (s === true || s === 'oui' || s === 'yes' || s === 'true') return 'oui';
    if (s === false || s === 'non' || s === 'no' || s === 'false') return 'non';
    return '';
  }

  function isOuiNonSelect(field) {
    return field?.type === 'select' && ( !field.options || field.options.length === 0 ||
      field.options.some(o => ['oui','non','yes','no','true','false'].includes(String(o).toLowerCase())) );
  }
  function findRapportController(sub) {
    let f = (sub.fields||[]).find(x => isOuiNonSelect(x) && (String(x.id||'').toLowerCase()==='rapport' || String(x.id||'').toLowerCase().endsWith('-rapport')));
    if (!f) f = (sub.fields||[]).find(x => isOuiNonSelect(x) && String(x.label||'').toLowerCase().trim().startsWith('rapport'));
    if (!f) f = (sub.fields||[]).find(x => isOuiNonSelect(x) && RX_RAPPORT.test((String(x.id||'')+' '+String(x.label||''))));
    if (!f) f = (sub.fields||[]).find(x => isOuiNonSelect(x));
    return f || null;
  }
  function findRapportUpload(sub) {
    const files = (sub.fields||[]).filter(f => f.type==='file');
    const byUpload = files.find(f => RX_UPLOAD.test((String(f.id||'')+' '+String(f.label||''))));
    const byRapport = files.find(f => RX_RAPPORT.test((String(f.id||'')+' '+String(f.label||''))));
    return byUpload || byRapport || files[0] || null;
  }
  function looksRapportButNotController(field, controller) {
    if (controller && field.id === controller.id) return false;
    const idl = (String(field.id||'')+' '+String(field.label||'')).toLowerCase();
    return RX_RAPPORT.test(idl);
  }
  function show(el, yes) { el.style.display = yes ? '' : 'none'; }

  function updateVisibilityForSubsection(secEl, section, sub, stateObj) {
    const allow = ALLOWED_RAPPORT.has(String(sub.id||'').toLowerCase());
    const fieldEls = secEl.querySelectorAll(`[data-field-path^="${section.id}.${sub.id}."]`);

    if (!allow) {
      // Template-driven only
      fieldEls.forEach((el) => {
        const path = el.dataset.fieldPath;
        const fieldId = path.split('.').pop();
        const field = (sub.fields || []).find(f => f.id === fieldId);
        if (!field) return;
        const visible = isFieldVisible(field, stateObj, level);
        show(el, !!visible);
      });
      if (window.AOS && (AOS.refreshHard || AOS.refresh)) setTimeout(() => (AOS.refreshHard ? AOS.refreshHard() : AOS.refresh()), 30);
      if (window.feather) window.feather.replace();
      return;
    }

    // Rapport-aware logic (only allowed subsections)
    const rapportCtrl = findRapportController(sub);
    const uploadField = findRapportUpload(sub);
    const rv = rapportCtrl ? getAtPath(stateObj, `${section.id}.${sub.id}.${rapportCtrl.id}`) : null;
    const choice = normOuiNon(rv);
    let uploadShown = false;

    fieldEls.forEach((el) => {
      const path = el.dataset.fieldPath;
      const fieldId = path.split('.').pop();
      const field = (sub.fields || []).find(f => f.id === fieldId);
      if (!field) return;

      let visible = isFieldVisible(field, stateObj, level);

      if (rapportCtrl) {
        if (choice === 'oui') {
          const designated = uploadField && field.id === uploadField.id;
          visible = (field.id === rapportCtrl.id) || (designated && !uploadShown);
          if (designated && !uploadShown) uploadShown = true;
        } else if (choice === 'non') {
          const isFile = field.type === 'file';
          const isOtherRapport = looksRapportButNotController(field, rapportCtrl);
          visible = (field.id === rapportCtrl.id) || (!isFile && !isOtherRapport);
        } else {
          visible = field.id === rapportCtrl.id;
        }
      }

      show(el, !!visible);
    });

    if (window.AOS && (AOS.refreshHard || AOS.refresh)) setTimeout(() => (AOS.refreshHard ? AOS.refreshHard() : AOS.refresh()), 30);
    if (window.feather) window.feather.replace();
  }
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


function subtitleClasses(style = {}) {
  const sizeMap = { xs:'text-xs', sm:'text-sm', md:'text-base', lg:'text-lg', xl:'text-xl', '2xl':'text-2xl' };
  const weightMap = { normal:'font-normal', medium:'font-medium', semibold:'font-semibold', bold:'font-bold' };
  const alignMap = { left:'text-left', center:'text-center', right:'text-right' };
  const marginMap = { none:'', xs:'my-1', sm:'my-2', md:'my-3', lg:'my-4', xl:'my-6' };
  const span = style.span === 1 ? '' : 'md:col-span-2';
  const size = sizeMap[String(style.size||'sm')] || sizeMap.sm;
  const weight = weightMap[String(style.weight||'semibold')] || weightMap.semibold;
  const align = alignMap[String(style.align||'left')] || alignMap.left;
  const italic = style.italic ? 'italic' : '';
  const upper = style.uppercase ? 'uppercase tracking-wide' : '';
  const margin = marginMap[String(style.margin||'sm')] || '';
  const extra = Array.isArray(style.classList) ? style.classList.join(' ') : (style.className || '');
  return `${span} ${size} ${weight} ${align} ${italic} ${upper} ${margin} ${extra}`.trim();
}
function renderField(field, subsectionData, onValueChange) {
  const wrap = document.createElement('div'); wrap.className = '';
  const id = `${field.id}`;

  if (!['monthTable','yearTable','subtitle'].includes(field.type)) {
    const lbl = document.createElement('label'); lbl.className = 'block text-sm font-medium text-gray-700 mb-1'; lbl.setAttribute('for', id);
    lbl.innerHTML = escapeHtml(field.label || field.id); wrap.appendChild(lbl);
  }

  const value = subsectionData ? subsectionData[field.id] : undefined;
  const cls = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
  const emit = (v) => {
  if (typeof v === 'function') return onValueChange(v);
  if ((field.type === 'monthTable' || field.type === 'yearTable') && v && typeof v === 'object' && !Array.isArray(v)) {
    return onValueChange((prev) => ({ ...(prev && typeof prev === 'object' ? prev : {}), ...v }));
  }
  return onValueChange(v);
};

  switch(field.type) {
    case 'textarea': {
      const ta = document.createElement('textarea'); ta.id=id; ta.name=id; ta.rows=3; ta.className=cls; ta.value = value ?? '';
      ta.addEventListener('input', () => emit(ta.value)); wrap.appendChild(ta); break;
    }
    case 'number': {
      const inp = document.createElement('input'); inp.type='number'; inp.step=field.validation?.step ?? 'any'; inp.id=id; inp.name=id; inp.className=cls;
      inp.value = (value ?? '') + ''; if (field.validation?.min!==undefined) inp.min=field.validation.min; if (field.validation?.max!==undefined) inp.max=field.validation.max;
      inp.addEventListener('input', () => emit(inp.value === '' ? null : Number(inp.value))); wrap.appendChild(inp); break;
    }
    case 'date': {
      const inp = document.createElement('input'); inp.type='date'; inp.id=id; inp.name=id; inp.className=cls; if (value) inp.value=value;
      inp.addEventListener('input', () => emit(inp.value || null)); wrap.appendChild(inp); break;
    }
    case 'select': {
  const sel = document.createElement('select'); sel.id=id; sel.name=id; sel.className=cls;
  const opts = Array.isArray(field.options) && field.options.length ? field.options : DEFAULT_SELECT;
  const ph = document.createElement('option'); ph.value=''; ph.textContent='Sélectionner'; sel.appendChild(ph);
  for (const o of opts) { const op = document.createElement('option'); op.value=o; op.textContent=o; sel.appendChild(op); }
  if (value) sel.value=value;
  sel.addEventListener('change', () => emit(sel.value || null));
  wrap.appendChild(sel); break;
}
    case 'file': {
  const container = document.createElement('div'); container.className='flex items-center';
  const real = document.createElement('input'); real.type='file'; real.id=id; real.name=id; real.className='hidden';
  if (field.multiple) real.multiple = true;

  const lab = document.createElement('label'); lab.className='inline-flex items-center px-3 py-2 bg-blue-100 border border-blue-300 rounded-md hover:bg-blue-200 text-blue-600 font-medium cursor-pointer';
  lab.setAttribute('for', id);
  lab.innerHTML = '<i data-feather="upload" class="mr-2"></i>Choisir un fichier';
  const nameSpan = document.createElement('span'); nameSpan.className='ml-3 text-gray-600 text-sm';
  if (Array.isArray(value)) {
    nameSpan.textContent = value.length ? `${value.length} fichier(s)` : '';
  } else if (value?.originalName) {
    nameSpan.textContent = value.originalName;
  } else if (value?.name) {
    nameSpan.textContent = value.name;
  }

  const resolvePath = () => {
    const holder = real.closest('[data-fieldpath],[data-field-path]');
    if (!holder) return '';
    return holder.getAttribute('data-fieldpath') || holder.getAttribute('data-field-path') || '';
  };

  real.addEventListener('change', async () => {
    const files = Array.from(real.files || []);
    const bId = (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
    const fieldPath = resolvePath();

    if (!files.length) { nameSpan.textContent=''; emit(field.multiple ? [] : null); return; }
    if (!fieldPath) {
      console.warn('fieldPath missing on file input');
      if (field.multiple) {
        const metas = files.map(f => ({ name: f.name, size: f.size, mime: f.type || '', url: null }));
        nameSpan.textContent = `${metas.length} fichier(s)`;
        emit((prev) => {
          const base = Array.isArray(prev) ? prev : (prev ? [prev] : []);
          return [...base, ...metas];
        });
      } else {
        const f = files[0];
        nameSpan.textContent = f.name;
        emit({ name: f.name, size: f.size, mime: f.type || '', url: null });
      }
      real.value=''; return;
    }

    const metas = [];
    for (const f of files) {
      try {
        const res = await api.uploadFile(bId, fieldPath, f);
        metas.push((res && res.file) ? res.file : { name: f.name, size: f.size, mime: f.type || '', url: null });
      } catch (err) {
        console.warn('upload failed', err);
        metas.push({ name: f.name, size: f.size, mime: f.type || '', url: null });
        alert('Échec du téléversement.');
      }
    }

    if (field.multiple) {
      nameSpan.textContent = `${metas.length} fichier(s)`;
      emit((prev) => {
        const base = Array.isArray(prev) ? prev : (prev ? [prev] : []);
        return [...base, ...metas];
      });
    } else {
      const meta = metas[0];
      nameSpan.textContent = meta.originalName || meta.name;
      emit(meta);
    }

    real.value='';
  });

  container.appendChild(lab);
  container.appendChild(real);
  container.appendChild(nameSpan);
  wrap.appendChild(container);
  break;
}
    
    case 'subtitle': {
      // Decorative, no data. Spans 2 columns by default unless style.span === 1
      const style = field.style || {};
      const showText = field.showText !== false; // default true
      const div = document.createElement('div');
      div.className = subtitleClasses(style);
      if (showText) {
        const txt = String(field.text ?? field.label ?? field.id ?? '').trim();
        const el = document.createElement(style.as || 'div');
        el.className = (style.as === 'h3' || style.as === 'h4') ? '' : '';
        el.textContent = txt;
        if (style.color && /(^#|rgb|hsl|var\().*/.test(String(style.color))) {
          try { el.style.color = style.color; } catch {}
        } else if (style.color) {
          // Tailwind palette aliases
          const colorMap = {
            muted:'text-gray-500', gray:'text-gray-600', primary:'text-blue-700',
            danger:'text-red-700', success:'text-green-700', warning:'text-yellow-700',
            info:'text-sky-700', blue:'text-blue-700', red:'text-red-700', green:'text-green-700',
            yellow:'text-yellow-700', sky:'text-sky-700'
          };
          div.classList.add(...(colorMap[String(style.color)]||'').split(' ').filter(Boolean));
        }
        div.appendChild(el);
      } else {
        // Just reserve vertical rhythm
        div.innerHTML = '&nbsp;';
      }
      // Mark non-data so progress/serialization can ignore it if they honor the flag
      try { div.dataset.containsData = String(field.containsData !== false); } catch {}
      if (!field.style || field.style.span !== 1) { try { wrap.classList.add('md:col-span-2'); } catch {} }
      wrap.appendChild(div);
      break;
    }
case 'monthTable': {
      wrap.classList.add('md:col-span-2');
      const title = document.createElement('div'); title.className='text-sm font-medium text-gray-800 mb-2'; title.textContent=field.label || ''; wrap.appendChild(title);
      const months=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"]; const current=(value&&typeof value==='object')?value:{};
      const table=document.createElement('table'); table.className='min-w-full table-fixed text-sm border border-gray-200 rounded-md';
      const thead=document.createElement('thead'); thead.className='bg-gray-50'; const headRow=document.createElement('tr');
      const th0=document.createElement('th'); th0.className='px-2 py-1 text-xs font-medium text-gray-600 text-left'; th0.textContent='Mois'; headRow.appendChild(th0);
      months.forEach(m=>{ const th=document.createElement('th'); th.className='px-2 py-1 text-xs font-medium text-gray-600 text-center w-24'; th.textContent=m[0].toUpperCase()+m.slice(1); headRow.appendChild(th); });
      thead.appendChild(headRow); table.appendChild(thead);
      const tbody=document.createElement('tbody'); const row=document.createElement('tr');
      const labelCell=document.createElement('td'); labelCell.className='px-2 py-1 text-xs text-gray-600'; labelCell.textContent=field.unit?`${field.unit}`:''; row.appendChild(labelCell);
      months.forEach(m=>{ const td=document.createElement('td'); td.className='px-2 py-1 text-center w-24'; const inp=document.createElement('input'); inp.type='number'; inp.step=field.validation?.step ?? 'any'; inp.className='w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'; inp.value=current[m] ?? ''; inp.addEventListener('input',()=>{ const next={...current,[m]:inp.value===''?null:Number(inp.value)}; onValueChange(next); }); td.appendChild(inp); row.appendChild(td); });
      tbody.appendChild(row); table.appendChild(tbody); const scroll=document.createElement('div'); scroll.className='overflow-x-auto rounded-md'; scroll.appendChild(table); wrap.appendChild(scroll); break;
    }
    case 'yearTable': {
      wrap.classList.add('md:col-span-2');
      const title=document.createElement('div'); title.className='text-sm font-medium text-gray-800 mb-2'; title.textContent=field.label || ''; wrap.appendChild(title);
      const years=Array.isArray(field.years)&&field.years.length?field.years:(()=>{const y=new Date().getFullYear(); return [y-4,y-3,y-2,y-1,y];})();
      const current=(value&&typeof value==='object')?value:{}; const table=document.createElement('table'); table.className='min-w-full table-fixed text-sm border border-gray-200 rounded-md';
      const thead=document.createElement('thead'); thead.className='bg-gray-50'; const headRow=document.createElement('tr');
      const th0=document.createElement('th'); th0.className='px-2 py-1 text-xs font-medium text-gray-600 text-left'; th0.textContent='Année'; headRow.appendChild(th0);
      years.forEach(y=>{ const th=document.createElement('th'); th.className='px-2 py-1 text-xs font-medium text-gray-600 text-center w-24'; th.textContent=String(y); headRow.appendChild(th); });
      thead.appendChild(headRow); table.appendChild(thead);
      const tbody=document.createElement('tbody'); const row=document.createElement('tr');
      const labelCell=document.createElement('td'); labelCell.className='px-2 py-1 text-xs text-gray-600'; labelCell.textContent=field.unit?`${field.unit}`:''; row.appendChild(labelCell);
      years.forEach(y=>{ const td=document.createElement('td'); td.className='px-2 py-1 text-center w-24'; const inp=document.createElement('input'); inp.type='number'; inp.step=field.validation?.step ?? 'any'; inp.className='w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500'; inp.value=current[y] ?? ''; inp.addEventListener('input',()=>{ const next={...current,[y]:inp.value===''?null:Number(inp.value)}; onValueChange(next); }); td.appendChild(inp); row.appendChild(td); });
      tbody.appendChild(row); table.appendChild(tbody); const scroll=document.createElement('div'); scroll.className='overflow-x-auto rounded-md'; scroll.appendChild(table); wrap.appendChild(scroll); break;
    }
    default: {
      const inp=document.createElement('input'); inp.type='text'; inp.id=id; inp.name=id; inp.className=cls; inp.value=value ?? '';
      inp.addEventListener('input', () => emit(inp.value)); wrap.appendChild(inp); break;
    }
  }
  return wrap;
}
