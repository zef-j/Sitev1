import { getCurrentFormContext } from './renderer.js';
import { isFieldVisible } from './visibility.js';
import { getAtPath } from './state.js';
import { api } from './api.js';

function flattenTemplate(template) {
  const out = [];
  const sections = Array.isArray((template || {}).sections) ? template.sections : [];
  sections.forEach((section) => {
    const secId = section.id || String(section.title || '').trim().toLowerCase().replace(/\s+/g, '-');
    const subsections = Array.isArray(section.subsections) ? section.subsections : null;
    if (subsections && subsections.length) {
      subsections.forEach((sub) => {
        const subId = sub.id || String(sub.title || '').trim().toLowerCase().replace(/\s+/g, '-');
        const fields = Array.isArray(sub.fields) ? sub.fields : [];
        fields.forEach((field) => {
          out.push({ path: `${secId}.${subId}.${field.id}`, field, section, subsection: sub });
        });
      });
    } else {
      const fields = Array.isArray(section.fields) ? section.fields : [];
      fields.forEach((field) => {
        out.push({ path: `${secId}.${field.id}`, field, section, subsection: null });
      });
    }
  });
  return out;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c){
    const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
    return map[c];
  });
}

function formatVal(v) {
  if (v === undefined) return '<span class="text-gray-400">—</span>';
  if (v === null) return '<span class="text-gray-400">∅</span>';
  if (typeof v === 'object') return '<code class="text-xs">'+escapeHtml(JSON.stringify(v))+'</code>';
  const s = String(v);
  return s.trim() === '' ? '<span class="text-gray-400">—</span>' : escapeHtml(s);
}

function createPanel() {
  let panel = document.getElementById('diff-panel');
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = 'diff-panel';
  panel.className = 'fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 bg-white shadow-2xl z-40 hidden overflow-y-auto';
  panel.innerHTML = `
    <div class="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-10">
      <div class="font-semibold text-gray-800 flex items-center">
        <i data-feather="git-commit" class="mr-2"></i>
        Revue des changements
      </div>
      <button id="diff-close" class="text-gray-500 hover:text-gray-700">
        <i data-feather="x"></i>
      </button>
    </div>
    <div id="diff-content" class="p-4 space-y-4"></div>
  `;
  document.body.appendChild(panel);
  panel.querySelector('#diff-close').addEventListener('click', ()=> panel.classList.add('hidden'));
  if (window.feather) window.feather.replace();
  return panel;
}

function computeDiff(oldD, newD) {
  function flatten(obj, prefix='') {
    const out = {};
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    Object.entries(obj || {}).forEach(([k,v]) => {
      const p = prefix ? `${prefix}.${k}` : k;
      if (isObj(v)) Object.assign(out, flatten(v, p));
      else out[p] = v;
    });
    return out;
  }
  const a = flatten(oldD||{});
  const b = flatten(newD||{});
  const added = [], removed = [], changed = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach((p) => {
    const ov = a[p]; const nv = b[p];
    if (ov === undefined && nv !== undefined) added.push({ path: p, old: undefined, new: nv });
    else if (ov !== undefined && nv === undefined) removed.push({ path: p, old: ov, new: undefined });
    else if (JSON.stringify(ov) !== JSON.stringify(nv)) changed.push({ path: p, old: ov, new: nv });
  });
  return { added, removed, changed };
}

function renderRows(diff, map, current, committed, level) {
  const rows = [];
  const visibleNow = (rec) => isFieldVisible(rec.field, current, level);
  const byPath = (path) => map.get(path);
  function makeRow(rec, oldV, newV, kind) {
    const title = String(rec.section?.title || rec.section?.id || '').trim();
    const sub = String(rec.subsection?.title || rec.subsection?.id || '').trim();
    const label = rec.field.label || rec.field.id;
    const path = rec.path;
    return `
      <div class="border rounded-lg p-3">
        <div class="text-xs text-gray-500 mb-1">${escapeHtml(title)} ${sub ? '• '+escapeHtml(sub) : ''}</div>
        <div class="text-sm font-medium mb-2">${escapeHtml(label)}</div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div class="bg-gray-50 rounded p-2">
            <div class="text-xs text-gray-500 mb-1">Avant</div>
            <div class="">${formatVal(oldV)}</div>
          </div>
          <div class="bg-gray-50 rounded p-2">
            <div class="text-xs text-gray-500 mb-1">Après</div>
            <div class="">${formatVal(newV)}</div>
          </div>
        </div>
        <div class="mt-2 text-xs ${visibleNow(rec) ? 'text-green-700' : 'text-amber-700'}">
          ${visibleNow(rec) ? 'Visible' : 'Masqué avec la configuration actuelle'}
          <span class="ml-2 inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-600">${escapeHtml(kind)}</span>
        </div>
        <div class="mt-1 text-[11px] text-gray-400 font-mono">${escapeHtml(path)}</div>
      </div>
    `;
  }
  (diff.changed || []).forEach(it => { const rec = byPath(it.path); if (rec) rows.push(makeRow(rec, it.old, it.new, 'modifié')); });
  (diff.added || []).forEach(it =>   { const rec = byPath(it.path); if (rec) rows.push(makeRow(rec, it.old, it.new, 'ajouté')); });
  (diff.removed || []).forEach(it => { const rec = byPath(it.path); if (rec) rows.push(makeRow(rec, it.old, it.new, 'supprimé')); });
  return rows.join('');
}

function computeDestructive(template, committed, current, level) {
  const flat = flattenTemplate(template);
  const list = [];
  flat.forEach((rec) => {
    const wasVis = isFieldVisible(rec.field, committed, level);
    const nowVis = isFieldVisible(rec.field, current, level);
    const oldV = getAtPath(committed, rec.path);
    if (wasVis && !nowVis && oldV !== undefined && oldV !== null && String(oldV).trim() !== '') {
      list.push({ path: rec.path, label: rec.field.label || rec.field.id });
    }
  });
  return list;
}

function confirmDestructive(list) {
  return new Promise((resolve) => {
    let dlg = document.getElementById('destructive-dlg');
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'destructive-dlg';
      dlg.className = 'fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50';
      dlg.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl p-5 max-w-lg w-full">
          <div class="text-lg font-semibold mb-2">Des champs remplis seront masqués</div>
          <div class="text-sm text-gray-700 mb-3">Vous avez modifié des sélections qui cachent des champs déjà remplis. Continuer la publication ?</div>
          <div class="max-h-40 overflow-y-auto border rounded p-2 mb-4 text-xs text-gray-600">${list.map(it => `<div>• ${escapeHtml(it.label)} <span class="text-gray-400">(${escapeHtml(it.path)})</span></div>`).join('')}</div>
          <div class="flex justify-end space-x-2">
            <button id="destructive-cancel" class="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200">Annuler</button>
            <button id="destructive-continue" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Continuer</button>
          </div>
        </div>
      `;
      document.body.appendChild(dlg);
    }
    dlg.classList.remove('hidden');
    dlg.querySelector('#destructive-cancel').onclick = () => { dlg.classList.add('hidden'); resolve(false); };
    dlg.querySelector('#destructive-continue').onclick = () => { dlg.classList.add('hidden'); resolve(true); };
  });
}

function confirmPublish(summaryHtml) {
  return new Promise((resolve) => {
    let dlg = document.getElementById('publish-confirm-dlg');
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'publish-confirm-dlg';
      dlg.className = 'fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50';
      dlg.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl p-5 max-w-md w-full">
          <div class="text-lg font-semibold mb-2">Confirmer la publication</div>
          <div class="text-sm text-gray-700 mb-3">${summaryHtml || 'Publier les changements actuels ?'}</div>
          <div class="flex justify-end space-x-2">
            <button id="pub-cancel" class="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200">Annuler</button>
            <button id="pub-continue" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Publier</button>
          </div>
        </div>`;
      document.body.appendChild(dlg);
    }
    dlg.classList.remove('hidden');
    dlg.querySelector('#pub-cancel').onclick = () => { dlg.classList.add('hidden'); resolve(false); };
    dlg.querySelector('#pub-continue').onclick = () => { dlg.classList.add('hidden'); resolve(true); };
  });
}

export async function openReviewPanel() {
  const ctx = getCurrentFormContext();
  const id = (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
  const since = window.__buildingMeta && window.__buildingMeta.dataVersion;
  const panel = createPanel();
  panel.classList.remove('hidden');

  const res = await api.getReview(id, since);
  const template = ctx.template || (window.__template || {});
  const flat = flattenTemplate(template);
  const map = new Map(flat.map(rec => [rec.path, rec]));

  const baseline = (window.__reviewBaselineOverride ? window.__reviewBaselineOverride : ((window.__lastPublishedSnapshot && JSON.parse(JSON.stringify(window.__lastPublishedSnapshot))) || (res.committed || {})));
  try { window.__reviewBaselineOverride = null; } catch {}
  const diff = computeDiff(baseline, ctx.data || {});
  const html = renderRows(diff, map, ctx.data || {}, baseline || {}, ctx.level);
  const content = panel.querySelector('#diff-content');
  content.innerHTML = html || '<div class="text-sm text-gray-500">Aucun changement détecté.</div>';
  if (window.feather) window.feather.replace();
}

let __publishing = false;
export async function publishWithConfirm() {
  if (__publishing) return;
  __publishing = true;
  try {
    const ctx = getCurrentFormContext();
    const id = (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
    const currentDV = window.__buildingMeta && window.__buildingMeta.dataVersion;

    const review = await api.getReview(id, currentDV);
    const committed = review && review.committed ? review.committed : {};
    const template = ctx.template || (window.__template || {});

    const destructive = computeDestructive(template, committed, ctx.data, ctx.level);
    let summary = '';
    if (destructive.length) {
      summary = '<div class="text-amber-700 mb-2">Des champs remplis seront masqués:</div>' +
                '<div class="max-h-32 overflow-y-auto border rounded p-2 mb-2 text-xs text-gray-600">' +
                destructive.map(it => `<div>• ${escapeHtml(it.label)} <span class="text-gray-400">(${escapeHtml(it.path)})</span></div>`).join('') +
                '</div>';
    } else {
      summary = 'Publier les changements actuels ?';
    }
    const okPub = await confirmPublish(summary);
    if (!okPub) return;

    const meta = window.__buildingMeta || {};
    const freshDV = meta.dataVersion;
    const freshEtag = meta.etag;

    const res = await api.publish(id, ctx.data, freshDV, freshEtag);
toast('Publication réussie (version '+(res && res.dataVersion)+')');
// Update baseline & clear local draft
try {
  window.__lastPublishedSnapshot = JSON.parse(JSON.stringify(ctx.data || {})); window.__renderedData = JSON.parse(JSON.stringify(ctx.data || {}));
  const draftKey = `formDraft:${id}:${ctx.level || 'L1'}`;
  localStorage.removeItem(draftKey);
} catch {}
const v = document.getElementById('data-version');
if (v && res && res.dataVersion) v.textContent = 'v'+String(res.dataVersion);
  } catch (e) {
    if (e && e.code === 412) { showConflict(); return; }
    toast('Erreur lors de la publication.');
  } finally {
    __publishing = false;
  }
}

function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-3 py-2 rounded shadow-lg z-50';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'), 2200);
}

function showConflict() {
  let dlg = document.getElementById('conflict-dlg');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.id = 'conflict-dlg';
    dlg.className = 'fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50';
    dlg.innerHTML = `
      <div class="bg-white rounded-xl shadow-xl p-5 max-w-md w-full">
        <div class="text-lg font-semibold mb-2">Conflit de version</div>
        <div class="text-sm text-gray-600 mb-4">Une autre session a publié des modifications. Rechargez pour revoir les différences.</div>
        <div class="flex justify-end space-x-2">
          <button id="conflict-cancel" class="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200">Fermer</button>
          <button id="conflict-reload" class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">Recharger &amp; Revoir</button>
        </div>
      </div>
    `;
    document.body.appendChild(dlg);
    dlg.querySelector('#conflict-cancel').addEventListener('click', ()=> dlg.classList.add('hidden'));
    dlg.querySelector('#conflict-reload').addEventListener('click', ()=> { location.reload(); });
  }
  dlg.classList.remove('hidden');
}

\1

// Download ZIP of current.json + files
const dl = document.getElementById('download-btn');
if (dl) {
  dl.addEventListener('click', async (ev)=>{
    ev.preventDefault();
    try {
      const id = (window.__buildingMeta && window.__buildingMeta.id) || (window.__meta && window.__meta.id);
      if (!id) throw new Error('No building id');

      // Prefer api.download if present, else fallback
      if (window.api && typeof window.api.download === 'function') {
        await window.api.download(id);
      } else {
        const url = `/buildings/${encodeURIComponent(id)}/download`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) {
          const msg = await res.text().catch(()=>'');
          throw new Error(`Download failed: ${res.status} ${msg}`);
        }
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        let fname = 'download.zip';
        const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
        if (m) fname = decodeURIComponent(m[1] || m[2]);
        const a = document.createElement('a');
        const urlObj = URL.createObjectURL(blob);
        a.href = urlObj;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(()=> URL.revokeObjectURL(urlObj), 4000);
      }
    } catch (e) {
      console.error(e);
      toast('Erreur lors du téléchargement', 'error');
    }
  });
}


  const review = document.getElementById('review-btn');
  const publish = document.getElementById('publish-btn');
  const save = document.getElementById('save-btn');
  if (review && !review.__bound) { review.addEventListener('click', openReviewPanel); review.__bound = true; }
  if (publish && !publish.__bound) { publish.addEventListener('click', publishWithConfirm); publish.__bound = true; }
  if (save && !save.__bound) {
    save.addEventListener('click', async () => {
      const ctx = getCurrentFormContext();
      const id = (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
      try {
        await api.save(id, ctx.data, 'manual-save');
try {
  const draftKey = `formDraft:${id}:${ctx.level || 'L1'}`;
  localStorage.setItem(draftKey, JSON.stringify(ctx.data || {}));
} catch {}
toast('Brouillon enregistré');
      } catch (e) {
        if (e && e.code === 412) { showConflict(); return; }
        toast('Échec de l’enregistrement.');
      }
    });
    save.__bound = true;
  }
  const v = document.getElementById('data-version');
  if (v && window.__buildingMeta && window.__buildingMeta.dataVersion) v.textContent = 'v' + String(window.__buildingMeta.dataVersion);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindButtons);
} else {
  bindButtons();
}
document.addEventListener('readystatechange', () => {
  if (document.readyState === 'interactive' || document.readyState === 'complete') bindButtons();
});

try { window.__openReviewPanel = openReviewPanel; window.__publishWithConfirm = publishWithConfirm; } catch (e) {}


export async function openVersionsPanel() {
  const id = (window.__buildingMeta && window.__buildingMeta.id) || 'b_1';
  let dlg = document.getElementById('versions-dlg');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.id = 'versions-dlg';
    dlg.className = 'fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50';
    dlg.innerHTML = `
      <div class="bg-white rounded-xl shadow-xl p-5 max-w-2xl w-full">
        <div class="text-lg font-semibold mb-2">Versions</div>
        <div id="versions-list" class="max-h-80 overflow-y-auto divide-y border rounded"></div>
        <div class="flex justify-end mt-3">
          <button id="versions-close" class="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200">Fermer</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#versions-close').addEventListener('click', ()=> dlg.classList.add('hidden'));
  }
  dlg.classList.remove('hidden');
  const listEl = dlg.querySelector('#versions-list');
  listEl.innerHTML = '<div class="p-3 text-sm text-gray-500">Chargement…</div>';
  const items = await api.listVersions(id);
  listEl.innerHTML = (items || []).map((it) => {
    return `<div class="p-3 flex justify-between items-center text-sm">
      <div><div class="font-mono">${it.versionId}</div><div class="text-xs text-gray-500">v${it.dataVersion} • ${it.createdAt}</div></div>
      <div class="flex space-x-2">
        <button class="px-2 py-1 border rounded text-xs" data-action="view" data-id="${it.versionId}">Voir</button>
        <button class="px-2 py-1 border rounded text-xs" data-action="diff" data-id="${it.versionId}">Diff → courant</button>
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const vId = ev.currentTarget.getAttribute('data-id') || '';
      const act = ev.currentTarget.getAttribute('data-action') || '';
      if (!vId) return;
      const snap = await api.getVersion(id, vId);
      if (act === 'diff') {
        try { window.__reviewBaselineOverride = snap?.data || {}; } catch {}
        dlg.classList.add('hidden');
        openReviewPanel();
      } else if (act === 'view') {
        alert('Version v'+(snap?.dataVersion)+' @ '+(snap?.templateVersion));
      }
    });
  });
}


// bind versions link
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.id === 'versions-link') {
    e.preventDefault();
    openVersionsPanel();
  }
});

// --- Auto-bind Publish button on load ---------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('publish-btn');
  if (btn && !btn.__bound) {
    // publishWithConfirm is defined in this module
    btn.addEventListener('click', publishWithConfirm);
    btn.__bound = true;
  }
});
