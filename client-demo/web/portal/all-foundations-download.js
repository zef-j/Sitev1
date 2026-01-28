import { translatePage } from '../form/i18n.js';

function createButton(hasGlobal){
  const btn = document.createElement('button');
  btn.id = 'all-foundations-download-btn';
  btn.className = `${hasGlobal ? 'ml-2' : 'ml-auto'} inline-flex items-center px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm shadow`;
  btn.innerHTML = '<i data-feather="archive" class="mr-2"></i><span data-i18n="ui.downloadAllData">Télécharger toutes les données</span>';
  return btn;
}

function findHeader(){
  return (
    document.querySelector('.max-w-6xl .flex.items-center.mb-6') ||
    document.querySelector('.max-w-6xl .flex.items-center') ||
    document.querySelector('.max-w-6xl')
  );
}

function startDownload(){
  // Use direct navigation so the browser streams the ZIP to disk (better for large files)
  const url = `/download/all-foundations?ts=${Date.now()}`;
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

function inject(){
  try{
    const header = findHeader();
    if (!header) return;
    if (document.getElementById('all-foundations-download-btn')) return;

    const globalBtn = document.getElementById('global-download-btn');
    const btn = createButton(!!globalBtn);

    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      try { startDownload(); }
      catch(e){ console.error(e); alert('Erreur lors du téléchargement'); }
    });

    if (globalBtn){
      globalBtn.insertAdjacentElement('afterend', btn);
    } else {
      header.appendChild(btn);
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
