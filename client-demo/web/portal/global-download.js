
import { translatePage } from '../form/i18n.js';

function createButton(){
  const btn = document.createElement('button');
  btn.id = 'global-download-btn';
  btn.className = 'ml-auto inline-flex items-center px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm shadow';
  btn.innerHTML = '<i data-feather="download" class="mr-2"></i><span data-i18n="ui.download">Télécharger</span>';
  return btn;
}
function findHeader(){
  return document.querySelector('.max-w-6xl .flex.items-center.mb-6') || document.querySelector('.max-w-6xl .flex.items-center') || document.querySelector('.max-w-6xl');
}
async function startDownload(){
  const r = await fetch('/download/global-overview');
  if (!r.ok) throw new Error('Download failed: ' + (await r.text()).slice(0,200));
  const cd = r.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename="?([^";]+)"?/i);
  const fname = m ? m[1] : 'global_overview.xlsx';
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 2000);
}

function inject(){
  try{
    const header = findHeader();
    if (!header) return;
    if (document.getElementById('global-download-btn')) return;
    const btn = createButton();
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      try { await startDownload(); }
      catch(e){ console.error(e); alert('Erreur lors du téléchargement'); }
    });
    header.appendChild(btn);
    if (window.feather && typeof window.feather.replace === 'function') window.feather.replace();
    if (typeof translatePage === 'function') translatePage();
  }catch(e){ console.error(e); }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(inject, 0);
} else {
  document.addEventListener('DOMContentLoaded', inject);
}
