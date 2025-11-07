// ESM adminRouter.js — complete set including add/rename/delete and robust ID change
import express from 'express';
import fs from 'fs';
import path from 'path';
import { DATA_ROOT, REGISTRY_FILE, SECRET_FILE, BACKUP_DIR, FOUNDATION_ALIASES_FILE } from './adminConfig.js';
import {
  ensureDirs, acquireLock, readJson, writeJsonAtomic,
  backupRegistry, listBackups, validateRegistry, slugify, audit,
  findDataDirsForBuilding, archiveAndMaybeDeleteData
} from './adminFs.js';
import { findBuildingDirByCurrentJson, moveDir } from './adminMove.js';

function readSecret() { try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { return ''; } }
function ok(req) { const key = (req.headers['x-admin-secret'] || req.query.key || '').toString(); const secret = readSecret(); return secret ? (key===secret) : true; }
function requireOk(req,res){ if (!ok(req)) { res.status(403).json({ error: 'Forbidden' }); return false; } return true; }

async function getRegistry(){ return await readJson(REGISTRY_FILE); }

function uniqueSlug(base, taken){
  let s = base; let i=2;
  const has = (x)=> taken.has(x);
  while (has(s)) s = `${base}-${i++}`;
  return s;
}

function treeFromRegistry(reg) {
  const map = new Map();
  for (const it of reg) {
    if (!map.has(it.foundationId)) {
      map.set(it.foundationId, { foundationId: it.foundationId, foundationName: it.foundationName, buildings: [] });
    }
    map.get(it.foundationId).buildings.push({ id: it.id, name: it.name });
  }
  const list = Array.from(map.values()).sort((a,b)=> a.foundationName.localeCompare(b.foundationName,'de'));
  for (const f of list) f.buildings.sort((a,b)=> a.name.localeCompare(b.name,'de'));
  return list;
}

export default function createAdminRouter() {
  ensureDirs();
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));
  router.use((req,res,next)=>{ if (!requireOk(req,res)) return; next(); });

  // ---- Registry tree & backups ----
  router.get('/registry/tree', async (_req,res)=>{
    const reg = await getRegistry();
    const f = treeFromRegistry(reg);
    const counts = { foundations: f.length, buildings: reg.length };
    res.json({ foundations: f, counts });
  });

  router.get('/registry/backups', async (_req,res)=>{
    const items = await listBackups();
    res.json({ backups: items });
  });

  router.post('/restore', async (req,res)=>{
    const { backupId } = req.body || {};
    if (!backupId) return res.status(400).json({ error: 'backupId required' });
    const src = path.join(BACKUP_DIR, backupId, 'buildings.json');
    const s = fs.readFileSync(src, 'utf8');
    validateRegistry(JSON.parse(s));
    await writeJsonAtomic(REGISTRY_FILE, JSON.parse(s));
    res.json({ ok: true });
  });

  // ---- Add foundation ----
  router.post('/add-foundation', async (req,res)=>{
    const { foundationName, initialBuildingName } = req.body || {};
    if (!foundationName || !initialBuildingName) return res.status(400).json({ error: 'foundationName and initialBuildingName required' });
    const reg = await getRegistry();
    const takenF = new Set(reg.map(x=>x.foundationId));
    let foundationId = uniqueSlug(slugify(foundationName), takenF);
    const takenB = new Set(reg.map(x=>x.id));
    let buildingId = uniqueSlug(slugify(initialBuildingName), takenB);
    const release = await acquireLock('registry');
    try {
      await backupRegistry('add-foundation');
      reg.push({ id: buildingId, name: initialBuildingName, foundationId, foundationName });
      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      await audit('add-foundation', { foundationId, foundationName, buildingId, buildingName: initialBuildingName }, req);
      res.json({ ok:true, foundationId, buildingId });
    } catch(e){ res.status(500).json({ error: String(e.message||e) }); }
    finally { await release(); }
  });

  // ---- Add building ----
  router.post('/add-building', async (req,res)=>{
    const { foundationId, buildingName } = req.body || {};
    if (!foundationId || !buildingName) return res.status(400).json({ error: 'foundationId and buildingName required' });
    const reg = await getRegistry();
    const fitem = reg.find(x=>x.foundationId===foundationId);
    if (!fitem) return res.status(404).json({ error: 'foundation not found' });
    const foundationName = fitem.foundationName;
    const taken = new Set(reg.map(x=>x.id));
    const id = uniqueSlug(slugify(buildingName), taken);
    const release = await acquireLock('registry');
    try {
      await backupRegistry('add-building');
      reg.push({ id, name: buildingName, foundationId, foundationName });
      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      await audit('add-building', { foundationId, id, name: buildingName }, req);
      res.json({ ok:true, id });
    } catch(e){ res.status(500).json({ error: String(e.message||e) }); }
    finally { await release(); }
  });

  // ---- Rename building ----
  router.post('/rename-building', async (req,res)=>{
    const { foundationId, id, newName } = req.body || {};
    if (!foundationId || !id || !newName) return res.status(400).json({ error: 'foundationId, id, newName required' });
    const reg = await getRegistry();
    const item = reg.find(x=>x.foundationId===foundationId && x.id===id);
    if (!item) return res.status(404).json({ error: 'building not found' });
    const release = await acquireLock('registry');
    try {
      await backupRegistry('rename-building');
      item.name = newName;
      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      await audit('rename-building',{ foundationId, id, newName }, req);
      res.json({ ok:true });
    } catch(e){ res.status(500).json({ error: String(e.message||e) }); }
    finally { await release(); }
  });

  // ---- Rename foundation ----
  router.post('/rename-foundation', async (req,res)=>{
    const { foundationId, newName } = req.body || {};
    if (!foundationId || !newName) return res.status(400).json({ error: 'foundationId, newName required' });
    const reg = await getRegistry();
    const hit = reg.some(x=>x.foundationId===foundationId);
    if (!hit) return res.status(404).json({ error: 'foundation not found' });
    const release = await acquireLock('registry');
    try {
      await backupRegistry('rename-foundation');
      for (const it of reg) if (it.foundationId===foundationId) it.foundationName = newName;
      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      await audit('rename-foundation',{ foundationId, newName }, req);
      res.json({ ok:true });
    } catch(e){ res.status(500).json({ error: String(e.message||e) }); }
    finally { await release(); }
  });

  // ---- Delete building ----
  router.post('/delete-building', async (req,res)=>{
    const { foundationId, id, dry, eraseData } = req.body || {};
    if (!foundationId || !id) return res.status(400).json({ error: 'foundationId and id required' });
    const reg = await getRegistry();
    const idx = reg.findIndex(x=>x.foundationId===foundationId && x.id===id);
    if (idx<0) return res.status(404).json({ error: 'building not found' });
    const dirs = await findDataDirsForBuilding(foundationId, id);
    if (dry) return res.json({ ok:true, dirs, bytes: 0 });
    const release = await acquireLock('registry');
    try {
      await backupRegistry('delete-building');
      reg.splice(idx,1);
      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      if (eraseData && dirs.length) await archiveAndMaybeDeleteData(dirs, 'delete-building', true);
      await audit('delete-building',{ foundationId, id, eraseData: !!eraseData }, req);
      res.json({ ok:true });
    } catch(e){ res.status(500).json({ error: String(e.message||e) }); }
    finally { await release(); }
  });

  // ---- Delete foundation ----
  router.post('/delete-foundation', async (req,res)=>{
    const { foundationId, dry, eraseData } = req.body || {};
    if (!foundationId) return res.status(400).json({ error: 'foundationId required' });
    const reg = await getRegistry();
    const buildings = reg.filter(x=>x.foundationId===foundationId);
    const dirsArrays = await Promise.all(buildings.map(b => findDataDirsForBuilding(foundationId, b.id)));
    const dirs = dirsArrays.flat();
    if (dry) return res.json({ ok:true, buildings: buildings.length, dirs });
    const release = await acquireLock('registry');
    try {
      await backupRegistry('delete-foundation');
      for (let i=reg.length-1; i>=0; i--) if (reg[i].foundationId===foundationId) reg.splice(i,1);
      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      if (eraseData && dirs.length) await archiveAndMaybeDeleteData(dirs, 'delete-foundation', true);
      await audit('delete-foundation',{ foundationId, eraseData: !!eraseData }, req);
      res.json({ ok:true });
    } catch(e){ res.status(500).json({ error: String(e.message||e) }); }
    finally { await release(); }
  });

  // ---- Change Building ID (robust) ----
  router.post('/change-building-id', async (req,res) => {
    const { foundationId, id, newId } = req.body || {};
    if (!foundationId || !id || !newId) return res.status(400).json({ error: 'foundationId, id and newId required' });
    const nid = slugify(newId);
    const reg = await getRegistry();
    const item = reg.find(x => x.foundationId === foundationId && x.id === id);
    if (!item) return res.status(404).json({ error: 'building not found' });
    if (reg.some(x => x.id === nid && x !== item)) return res.status(409).json({ error: 'newId already exists' });

    // Locate data directories for old id
    let dirs = await findDataDirsForBuilding(foundationId, id);
    // Filter to paths that actually exist
    dirs = dirs.filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
    if (!dirs.length) dirs = await findBuildingDirByCurrentJson(id);

    const release = await acquireLock('registry');
    try {
      await audit('change-building-id', { foundationId, id, newId: nid, dataDirs: dirs.length }, req);
      await backupRegistry('change-building-id');

      let moved = 0;
      for (const d of dirs) {
        const dest = path.join(path.dirname(d), nid);
        await moveDir(d, dest);
        // update current.json to keep it consistent
        try {
          const cur = path.join(dest, 'current.json');
          const j = JSON.parse(fs.readFileSync(cur, 'utf8'));
          j.buildingId = nid;
          fs.writeFileSync(cur, JSON.stringify(j, null, 2));
        } catch {}
        moved++;
      }

      // Update registry (always)
      item.aliases = Array.isArray(item.aliases) ? item.aliases : [];
      if (!item.aliases.includes(id)) item.aliases.push(id);
      item.id = nid;
      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      res.json({ ok: true, moved, id: nid, aliases: item.aliases });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    } finally { await release(); }
  });

  // ---- Change Foundation ID ----
  router.post('/change-foundation-id', async (req,res) => {
    const { oldId, newId } = req.body || {};
    if (!oldId || !newId) return res.status(400).json({ error: 'oldId and newId required' });
    const nid = slugify(newId);
    const reg = await getRegistry();
    if (reg.some(x => x.foundationId === nid)) return res.status(409).json({ error: 'newId already exists' });

    // Derive actual foundation dirs from buildings
    const buildingIds = reg.filter(x=>x.foundationId===oldId).map(x=>x.id);
    const dirmap = new Set();
    for (const bid of buildingIds) {
      let dirs = await findDataDirsForBuilding(oldId, bid);
      dirs = dirs.filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
      for (const d of dirs) dirmap.add(path.dirname(path.dirname(d)));
    }
    const fdirs = Array.from(dirmap);

    const release = await acquireLock('registry');
    try {
      await audit('change-foundation-id', { oldId, newId: nid, dirs: fdirs.length }, req);
      await backupRegistry('change-foundation-id');

      for (const d of fdirs) {
        const dest = path.join(path.dirname(d), nid);
        try { await moveDir(d, dest); } catch {}
      }
      for (const it of reg) if (it.foundationId === oldId) it.foundationId = nid;

      // Update aliases file
      let map = {};
      try { map = JSON.parse(fs.readFileSync(FOUNDATION_ALIASES_FILE,'utf8')); } catch {}
      map[oldId] = nid;
      await writeJsonAtomic(FOUNDATION_ALIASES_FILE, map);

      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      res.json({ ok: true, moved: fdirs.length, id: nid });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    } finally { await release(); }
  });

  return router;
}
