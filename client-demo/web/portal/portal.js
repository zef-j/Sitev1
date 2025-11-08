import { ensureLangSelector, initI18n, setI18nBase, translatePage } from '../form/i18n.js';
setI18nBase('/i18n/');

async function resolveFoundationId(fid){
  try{
    const r = await fetch('../foundation-aliases');
    if (!r.ok) return fid;
    const map = await r.json();
    if (map && map[fid] && map[fid] !== fid) {
      const url = new URL(location.href);
      url.searchParams.set('id', map[fid]);
      location.replace(url.toString());
      return map[fid];
    }
  }catch{}
  return fid;
}
import { api } from '../form/api.js';
import { computeProgress } from '../form/progress.js';


// --- Global Download button injection --------------------------------------
function injectGlobalDownloadButton(){
  try{
    const header = document.querySelector('.max-w-6xl .flex.items-center, .max-w-6xl .flex.items-center.space-x-3, .max-w-6xl .flex.items-center.mb-6') || document.querySelector('.max-w-6xl');
    if (!header) return;
    if (document.getElementById('global-download-btn')) return;
    const wrap = document.createElement('div');
    wrap.className = 'ml-auto';
    const btn = document.createElement('button');
    btn.id = 'global-download-btn';
    btn.className = 'bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm inline-flex items-center';
    btn.innerHTML = '<i data-feather="download" class="mr-2"></i><span data-i18n="ui.download">Télécharger</span>';
    btn.addEventListener('click', async (ev)=>{
      ev.preventDefault();
      try{
        const res = await fetch('/download/global-overview', { method: 'GET' });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        let fname = 'global_overview.xlsx';
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
      }catch(e){
        console.error(e);
        try{ alert('Erreur lors du téléchargement'); }catch{}
      }
    });
    wrap.appendChild(btn);
    header.appendChild(wrap);
    try{ if (window.feather) window.feather.replace(); }catch{}
    try{ if (window.translatePage) window.translatePage(document); }catch{}
  }catch(e){ console.warn('injectGlobalDownloadButton failed', e); }
}
const baseFormUrl = '../form/app.html';
const qs = (k)=> new URLSearchParams(location.search).get(k) || '';
const foundationUrl = (fid)=> `./foundation.html?id=${encodeURIComponent(fid)}`;
const buildingFormUrl = (bid)=> `${baseFormUrl}?id=${encodeURIComponent(bid)}&level=L1`;

async function progressForBuilding(id){
  try{
    const form = await api.getBuildingForm(id);
    const pr = computeProgress({ data: form?.data||{}, template: form?.template||{}, level: 'L1' });
    return Math.round(pr?.overall ?? pr?.L1 ?? 0);
  }catch(e){
    console.warn('progress error', id, e);
    return 0;
  }
}

async function loadFoundations(){ try{ await initI18n(); }catch{} try{ ensureLangSelector(document.querySelector('body .flex')||document.body); await initI18n(); }catch{}
  const cont = document.getElementById('list');
  const b = await api.getBuildings();
  const map = new Map();
  for(const it of b){
    const fid = it.foundationId || 'f_default';
    const fname = it.foundationName || 'Default';
    if(!map.has(fid)) map.set(fid, { id: fid, name: fname, buildings: [] });
    map.get(fid).buildings.push(it);
  }
  const items = Array.from(map.values());

  cont.innerHTML = items.map(f => {
    const pctId = `pct-${f.id}`;
    return `<a href="${foundationUrl(f.id)}" class="block rounded-xl border bg-white p-4 hover:shadow">
      <div class="flex items-center justify-between">
        <div class="font-medium">${f.name}</div>
        <div class="text-sm text-gray-600"><span id="${pctId}">0%</span></div>
      </div>
    </a>`;
  }).join('');
  feather.replace(); try{ translatePage(document); }catch{}

  for (const f of items){
    const ps = await Promise.all((f.buildings||[]).map(b => progressForBuilding(b.id)));
    const avg = ps.length ? Math.round(ps.reduce((a,c)=>a+c,0)/ps.length) : 0;
    const el = document.getElementById(`pct-${f.id}`);
    if (el) el.textContent = `${avg}%`;
  }
}

async function loadFoundation(){ try{ await initI18n(); }catch{} try{ ensureLangSelector(document.querySelector('body .flex')||document.body); await initI18n(); }catch{}
  const fid0 = qs('id') || 'f_default'; await resolveFoundationId(fid0); const fid = qs('id') || fid0;
  const cont = document.getElementById('list');
  const crumb = document.getElementById('crumb-foundation');
  const title = document.getElementById('title');
  const totalPct = document.getElementById('total-pct');
  const all = await api.getBuildings();
  const buildings = all.filter(x => (x.foundationId || 'f_default')===fid);
  const fname = buildings[0]?.foundationName || 'Fondation';
  crumb.textContent = fname; title.textContent = fname;

  const rows = await Promise.all(buildings.map(async (b) => {
    const pct = await progressForBuilding(b.id);
    return { id: b.id, name: b.name||b.id, pct };
  }));

  const avg = rows.length ? Math.round(rows.reduce((a,c)=>a+c.pct,0)/rows.length) : 0;
  totalPct.textContent = `${avg}%`;

  cont.innerHTML = rows.map(r => `<a href="${buildingFormUrl(r.id)}" class="block rounded-xl border bg-white p-4 hover:shadow">
    <div class="flex items-center justify-between">
      <div class="font-medium">${r.name}</div>
      <div class="text-sm text-gray-600">${r.pct}%</div>
    </div>
  </a>`).join('');
  feather.replace(); try{ translatePage(document); }catch{}
}

if (location.pathname.endsWith('index.html')) { injectGlobalDownloadButton(); loadFoundations(); } else { loadFoundation(); }