import { api } from '../form/api.js';
import { computeProgress } from '../form/progress.js';

const baseFormUrl = '../form/app.html';
const qs = (k)=> new URLSearchParams(location.search).get(k) || '';
const foundationUrl = (fid)=> `./foundation.html?id=${encodeURIComponent(fid)}`;
const buildingFormUrl = (bid)=> `${baseFormUrl}?id=${encodeURIComponent(bid)}&level=L1`;

async function loadFoundations(){
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
  cont.innerHTML = items.map(f => `<a href="${foundationUrl(f.id)}" class="block rounded-xl border bg-white p-4 hover:shadow">
    <div class="flex items-center justify-between">
      <div class="font-medium">${f.name}</div>
      <div class="text-sm text-gray-600">${f.buildings.length} bâtiments</div>
    </div>
  </a>`).join('');
  feather.replace();
}

async function loadFoundation(){
  const fid = qs('id') || 'f_default';
  const cont = document.getElementById('list');
  const crumb = document.getElementById('crumb-foundation');
  const title = document.getElementById('title');
  const totalPct = document.getElementById('total-pct');
  const all = await api.getBuildings();
  const buildings = all.filter(x => (x.foundationId || 'f_default')===fid);
  const fname = buildings[0]?.foundationName || 'Fondation';
  crumb.textContent = fname; title.textContent = fname;

  let sum=0; const rows=[];
  for(const b of buildings){
    const form = await api.getBuildingForm(b.id);
    const pr = computeProgress({ data: form.data||{}, template: form.template||{}, level: 'L1' });
    const p = pr?.overall ?? 0;
    sum += p; rows.push({ id:b.id, name:b.name||b.id, pct:p });
  }
  totalPct.textContent = `${Math.round(sum/Math.max(1,rows.length))}%`;
  cont.innerHTML = rows.map(r => `<a href="${buildingFormUrl(r.id)}" class="block rounded-xl border bg-white p-4 hover:shadow">
    <div class="flex items-center justify-between">
      <div class="font-medium">${r.name}</div>
      <div class="text-sm text-gray-600">${r.pct}%</div>
    </div>
  </a>`).join('');
  feather.replace();
}

if (location.pathname.endsWith('index.html')) loadFoundations(); else loadFoundation();
