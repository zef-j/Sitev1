(function(){
  const API = '/admin/api';

  async function changeBuildingId(foundationId, id){
    const newId = prompt('New ID (leave blank to cancel):', id);
    if (!newId || newId.trim()===id) return;
    await call('POST','/change-building-id',{ foundationId, id, newId: newId.trim() });
    toast('Building ID changed'); await loadTree();
  }
  async function changeFoundationId(oldId){
    const newId = prompt('New foundation ID (leave blank to cancel):', oldId);
    if (!newId || newId.trim()===oldId) return;
    await call('POST','/change-foundation-id',{ oldId, newId: newId.trim() });
    toast('Foundation ID changed'); await loadTree();
  }

  let KEY = sessionStorage.getItem('admin_key') || '';
  const headers = () => KEY ? { 'x-admin-secret': KEY, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  function fmtSize(n){ if(n<1024) return n+' B'; if(n<1024*1024) return (n/1024).toFixed(1)+' KB'; return (n/1024/1024).toFixed(1)+' MB'; }
  function toast(msg, warn=false){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.toggle('warn', !!warn); t.style.display='block'; setTimeout(()=>t.style.display='none', 2600); }

  async function call(method, path, body){
    const qs = (method==='GET' && KEY) ? ('?key='+encodeURIComponent(KEY)) : '';
    const r = await fetch(API+path+qs, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (!r.ok) {
      let txt = await r.text().catch(()=>'');
      try { const j = JSON.parse(txt); throw new Error(j.error || txt || r.statusText); } catch { throw new Error(txt || r.statusText); }
    }
    return r.json();
  }

  let TREE = []; let COUNTS={}; let SEL=null;

  function setKey(newKey){
    KEY = newKey || '';
    if (KEY) sessionStorage.setItem('admin_key', KEY);
    document.getElementById('keyStatus').textContent = KEY ? 'unlocked' : 'locked';
  }

  async function loadTree(){
    const j = await call('GET','/registry/tree');
    TREE = j.foundations; COUNTS = j.counts;
    renderLeft(); if (!SEL && TREE.length) { SEL = TREE[0].foundationId; }
    renderRight();
    document.getElementById('counts').textContent = `${COUNTS.foundations} foundations • ${COUNTS.buildings} buildings`;
  }

  function renderLeft(){
    const q = (document.getElementById('search').value || '').toLowerCase();
    const host = document.getElementById('foundations'); host.innerHTML = '';
    TREE.filter(f => f.foundationName.toLowerCase().includes(q) || f.foundationId.toLowerCase().includes(q))
        .forEach(f => {
          const row = document.createElement('div'); row.className='f-row';
          const left = document.createElement('div'); left.innerHTML = `<div><strong>${f.foundationName}</strong></div><div class="muted">${f.foundationId}</div>`;
          const right = document.createElement('div'); right.className='toolbar';
          const btnSel = document.createElement('button'); btnSel.textContent = (SEL===f.foundationId?'Selected':'Open');
          btnSel.onclick = ()=>{ SEL = f.foundationId; renderLeft(); renderRight(); };
          const btnRen = document.createElement('button'); btnRen.textContent = 'Rename';
          btnRen.onclick = async ()=>{
            try{
              const nn = prompt('New foundation name:', f.foundationName);
              if (!nn || nn.trim()===f.foundationName) return;
              await call('POST','/rename-foundation',{ foundationId:f.foundationId, newName: nn.trim() });
              toast('Foundation renamed'); await loadTree();
            }catch(e){ toast(e.message, true); }
          };
          const btnDel = document.createElement('button'); btnDel.className='danger'; btnDel.textContent = 'Delete';
          btnDel.onclick = async ()=>{
            try{
              const dry = await call('POST','/delete-foundation',{ foundationId:f.foundationId, dry:true });
              const erase = confirm(`Delete foundation "${f.foundationName}" (${f.foundationId})?\nThis will remove ${dry.buildings.length} building(s).\nAlso delete saved data? Click OK = yes, Cancel = no.`);
              if (!confirm('Type "DELETE" in the next prompt to confirm.')) return;
              const sure = prompt('Type DELETE to confirm:'); if (sure!=='DELETE') return;
              await call('POST','/delete-foundation',{ foundationId:f.foundationId, eraseData: erase });
              toast('Foundation deleted'); SEL=null; await loadTree();
            }catch(e){ toast(e.message, true); }
          };
          const btnCidF = document.createElement('button'); btnCidF.textContent='Change ID'; btnCidF.onclick = ()=> changeFoundationId(f.foundationId);
          right.append(btnSel, btnRen, btnCidF, btnDel);
          row.append(left, right);
          host.append(row);
        });
    const add = document.createElement('div'); add.style.marginTop='8px';
    const btnAdd = document.createElement('button'); btnAdd.className='primary'; btnAdd.textContent='Add foundation';
    btnAdd.onclick = async ()=>{
      try{
        const fname = prompt('Foundation name:');
        if (!fname) return;
        const bname = prompt('First building name:');
        if (!bname) return;
        await call('POST','/add-foundation',{ foundationName: fname.trim(), initialBuildingName: bname.trim() });
        toast('Foundation created'); await loadTree();
      }catch(e){ toast(e.message, true); }
    };
    add.append(btnAdd); host.append(add);
  }

  function renderRight(){
    const host = document.getElementById('right'); host.innerHTML='';
    const f = TREE.find(x=>x.foundationId===SEL);
    if (!f) { host.innerHTML='<div class="muted">Select a foundation…</div>'; return; }
    const header = document.createElement('div');
    header.innerHTML = `<h3>${f.foundationName}</h3><div class="muted">${f.foundationId}</div>`;
    const toolbar = document.createElement('div'); toolbar.className='toolbar';
    const addB = document.createElement('button'); addB.className='primary'; addB.textContent='Add building';
    addB.onclick = async ()=>{
      try{
        const name = prompt('New building name:');
        if (!name) return;
        await call('POST','/add-building',{ foundationId:f.foundationId, foundationName:f.foundationName, buildingName:name.trim() });
        toast('Building added'); await loadTree();
      }catch(e){ toast(e.message, true); }
    };
    toolbar.append(addB);
    host.append(header, toolbar);

    const list = document.createElement('div'); list.className='b-list';
    f.buildings.forEach(b=>{
      const row = document.createElement('div'); row.className='b-row';
      const left = document.createElement('div'); left.innerHTML = `<div><strong>${b.name}</strong></div><div class="muted">${b.id}</div>`;
      const right = document.createElement('div'); right.className='toolbar';
      const ren = document.createElement('button'); ren.textContent='Rename';
      ren.onclick = async ()=>{
        try{
          const nn = prompt(`Rename "${b.name}" to:` , b.name);
          if (!nn || nn.trim()===b.name) return;
          await call('POST','/rename-building',{ foundationId:f.foundationId, id:b.id, newName: nn.trim() });
          toast('Building renamed'); await loadTree();
        }catch(e){ toast(e.message, true); }
      };
      const del = document.createElement('button'); del.className='danger'; del.textContent='Delete';
      del.onclick = async ()=>{
        try{
          const dry = await call('POST','/delete-building',{ foundationId:f.foundationId, id:b.id, dry:true });
          const erase = confirm(`Delete building "${b.name}"?\nFound ${dry.dataDirs.length} data folder(s). Also delete saved data? OK = yes, Cancel = no.`);
          if (!confirm('Type "DELETE" in the next prompt to confirm.')) return;
          const sure = prompt('Type DELETE to confirm:'); if (sure!=='DELETE') return;
          await call('POST','delete-building',{ foundationId:f.foundationId, id:b.id, eraseData: erase });
          toast('Building deleted'); await loadTree();
        }catch(e){ toast(e.message, true); }
      };
      right.append(ren, del);
      row.append(left, right);
      list.append(row);
    });
    host.append(list);
  }

  async function loadBackups(){
    try{
      const j = await call('GET','/registry/backups');
      const host = document.getElementById('right'); host.innerHTML='';
      const title = document.createElement('h3'); title.textContent='Registry backups';
      host.append(title);
      j.backups.forEach(b=>{
        const row = document.createElement('div'); row.className='backup';
        const when = new Date(b.mtime).toLocaleString();
        row.innerHTML = `<div><strong>${b.id}</strong><div class="muted">${when} • ${fmtSize(b.size)}</div></div>`;
        const btn = document.createElement('button'); btn.textContent='Restore'; btn.onclick = async ()=>{
          try{
            if (!confirm(`Restore ${b.id}? This replaces the current registry.`)) return;
            await call('POST','/restore',{ backupId: b.id });
            toast('Restored backup'); await loadTree();
          }catch(e){ toast(e.message, true); }
        };
        const btnCid = document.createElement('button'); btnCid.textContent='Change ID'; btnCid.onclick = ()=> changeBuildingId(SEL.foundationId, b.id);
        row.append(btn, btnCid); host.append(row);
      });
    }catch(e){ toast(e.message, true); }
  }

  document.getElementById('btnSetKey').onclick = ()=>{
    const k = prompt('Enter admin secret (stored only this session):', KEY || '');
    if (k!=null) { setKey(k.trim()); loadTree().catch(e=>toast(e.message,true)); }
  };
  document.getElementById('search').oninput = ()=> renderLeft();
  document.getElementById('tabEditor').onclick = ()=>{
    document.getElementById('tabEditor').classList.add('active');
    document.getElementById('tabBackups').classList.remove('active');
    loadTree().catch(e=>toast(e.message,true));
  };
  document.getElementById('tabBackups').onclick = ()=>{
    document.getElementById('tabBackups').classList.add('active');
    document.getElementById('tabEditor').classList.remove('active');
    loadBackups();
  };

  if (!KEY) setTimeout(()=>document.getElementById('btnSetKey').click(), 200);
  loadTree().catch(e=>toast(e.message,true));
})();