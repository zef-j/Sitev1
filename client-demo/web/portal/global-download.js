import { translatePage } from '../form/i18n.js';

function createGlobalButton(){
  const btn = document.createElement('button');
  btn.id = 'global-download-btn';
  btn.className = 'inline-flex items-center px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm shadow';
  btn.innerHTML = '<i data-feather="download" class="mr-2"></i><span data-i18n="ui.download">Télécharger</span>';
  return btn;
}

function createAllButton(){
  const btn = document.createElement('button');
  btn.id = 'all-foundations-download-btn';
  btn.className = 'inline-flex items-center px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm shadow';
  btn.innerHTML = '<i data-feather="archive" class="mr-2"></i><span data-i18n="ui.downloadAll">Télécharger tout</span>';
  return btn;
}

function findHeader(){
  return document.querySelector('.max-w-6xl .flex.items-center.mb-6') ||
         document.querySelector('.max-w-6xl .flex.items-center') ||
         document.querySelector('.max-w-6xl');
}

async function startDownloadGlobal(){
  const r = await fetch('/download/global-overview');
  if (!r.ok) throw new Error('Download failed: ' + (await r.text()).slice(0,200));
  const cd = r.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=?([^;\"]+)/i);
  const fname = m ? decodeURIComponent(m[1] || m[2] || m[3] || '') : 'global_overview.xlsx';
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname || 'global_overview.xlsx';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 2000);
}

async function startDownloadAll(){
  const r = await fetch('/download/all-foundations');
  if (!r.ok) throw new Error('Download failed: ' + (await r.text()).slice(0,200));
  const cd = r.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=?([^;\"]+)/i);
  const fname = m ? decodeURIComponent(m[1] || m[2] || m[3] || '') : 'all_foundations.zip';
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname || 'all_foundations.zip';
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 2000);
}

function ensureWrap(header){
  let wrap = document.getElementById('download-buttons-wrap');
  if (wrap) return wrap;

  const globalBtn = document.getElementById('global-download-btn');
  if (globalBtn && globalBtn.parentElement) {
    wrap = globalBtn.parentElement;
  } else {
    wrap = document.createElement('div');
    header.appendChild(wrap);
  }

  wrap.id = 'download-buttons-wrap';
  wrap.classList.add('ml-auto', 'flex', 'flex-wrap', 'gap-2', 'items-center');
  return wrap;
}

function inject(){
  try{
    const header = findHeader();
    if (!header) return;

    const wrap = ensureWrap(header);

    if (!document.getElementById('global-download-btn')) {
      const btn = createGlobalButton();
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        try { await startDownloadGlobal(); }
        catch(e){ console.error(e); alert('Erreur lors du téléchargement'); }
      });
      wrap.appendChild(btn);
    }

    if (!document.getElementById('all-foundations-download-btn')) {
      const btn = createAllButton();
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        try { await startDownloadAll(); }
        catch(e){ console.error(e); alert('Erreur lors du téléchargement'); }
      });
      wrap.appendChild(btn);
    }

    if (window.feather && typeof window.feather.replace === 'function') window.feather.replace();
    if (typeof translatePage === 'function') translatePage();
  }catch(e){ console.error(e); }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(inject, 0);
} else {
  document.addEventListener('DOMContentLoaded', inject);
}
