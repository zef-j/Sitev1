// ESM adminRouter.js — clean, with default export
import express from 'express';
import fs from 'fs';
import path from 'path';
import { REGISTRY_FILE, SECRET_FILE, BACKUP_DIR } from './adminConfig.js';
import {
  ensureDirs, acquireLock, readJson, writeJsonAtomic,
  backupRegistry, listBackups, validateRegistry, slugify, audit,
  findDataDirsForBuilding, archiveAndMaybeDeleteData
} from './adminFs.js';

function readSecret() {
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); }
  catch { return null; }
}

function requireAdmin(req, res, next) {
  const want = readSecret();
  if (!want) return res.status(503).json({ error: 'Admin secret not set. Create file: ' + SECRET_FILE });
  const got = (req.headers['x-admin-secret'] || req.query.key || '').toString().trim();
  if (!got || got !== want) return res.status(403).json({ error: 'Forbidden' });
  res.setHeader('Cache-Control', 'no-store');
  next();
}

function groupTree(reg) {
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
  router.use(requireAdmin);

  router.get('/registry/tree', async (req,res) => {
    try {
      const reg = await readJson(REGISTRY_FILE);
      const tree = groupTree(reg);
      res.json({ foundations: tree, counts: { foundations: tree.length, buildings: reg.length }});
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });

  router.get('/registry/backups', async (_req,res) => {
    try { res.json({ backups: await listBackups() }); }
    catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  });

  router.post('/rename-foundation', async (req,res) => {
    const { foundationId, newName } = req.body || {};
    if (!foundationId || !newName) return res.status(400).json({ error: 'foundationId and newName required' });
    const release = await acquireLock('registry');
    try {
      await audit('rename-foundation', { foundationId, newName }, req);
      const reg = await readJson(REGISTRY_FILE);
      let changed = 0;
      for (const it of reg) if (it.foundationId === foundationId) { it.foundationName = newName.trim(); changed++; }
      if (!changed) return res.status(404).json({ error: 'foundation not found' });
      validateRegistry(reg);
      await backupRegistry('rename-foundation');
      await writeJsonAtomic(REGISTRY_FILE, reg);
      res.json({ ok: true, changed });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    finally { await release(); }
  });

  router.post('/rename-building', async (req,res) => {
    const { foundationId, id, newName } = req.body || {};
    if (!foundationId || !id || !newName) return res.status(400).json({ error: 'foundationId, id and newName required' });
    const release = await acquireLock('registry');
    try {
      await audit('rename-building', { foundationId, id, newName }, req);
      const reg = await readJson(REGISTRY_FILE);
      const item = reg.find(x => x.foundationId === foundationId && x.id === id);
      if (!item) return res.status(404).json({ error: 'building not found' });
      item.name = newName.trim();
      validateRegistry(reg);
      await backupRegistry('rename-building');
      await writeJsonAtomic(REGISTRY_FILE, reg);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    finally { await release(); }
  });

  router.post('/add-building', async (req,res) => {
    const { foundationId, foundationName, buildingName, buildingId } = req.body || {};
    if (!buildingName) return res.status(400).json({ error: 'buildingName required' });
    const release = await acquireLock('registry');
    try {
      await audit('add-building', { foundationId, foundationName, buildingName, buildingId }, req);
      const reg = await readJson(REGISTRY_FILE);

      let fid = foundationId, fname = foundationName;
      const existingF = fid ? reg.find(x => x.foundationId === fid) : null;
      if (!existingF) {
        if (!fid && fname) fid = slugify(fname);
        if (!fid || !fname) return res.status(400).json({ error: 'new foundation requires foundationId or foundationName' });
      } else {
        fname = existingF.foundationName;
      }

      let bid = buildingId || slugify(buildingName);
      if (!bid.startsWith(fid)) bid = `${fid}-${bid}`;
      let base = bid, i = 2;
      while (reg.some(x => x.id === bid)) bid = `${base}-${i++}`;

      reg.push({ id: bid, name: buildingName.trim(), foundationId: fid, foundationName: fname });
      validateRegistry(reg);
      await backupRegistry('add-building');
      await writeJsonAtomic(REGISTRY_FILE, reg);
      res.json({ ok: true, id: bid });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    finally { await release(); }
  });

  router.post('/add-foundation', async (req,res) => {
    const { foundationName, foundationId, initialBuildingName, buildingId } = req.body || {};
    if (!foundationName || !initialBuildingName) return res.status(400).json({ error: 'foundationName and initialBuildingName required' });
    const release = await acquireLock('registry');
    try {
      await audit('add-foundation', { foundationName, foundationId, initialBuildingName, buildingId }, req);
      const reg = await readJson(REGISTRY_FILE);

      const fid = foundationId || slugify(foundationName);
      const fname = foundationName;
      let bid = buildingId || slugify(initialBuildingName);
      if (!bid.startsWith(fid)) bid = `${fid}-${bid}`;
      let base = bid, i = 2;
      while (reg.some(x => x.id === bid)) bid = `${base}-${i++}`;

      reg.push({ id: bid, name: initialBuildingName.trim(), foundationId: fid, foundationName: fname });
      validateRegistry(reg);
      await backupRegistry('add-foundation');
      await writeJsonAtomic(REGISTRY_FILE, reg);
      res.json({ ok: true, foundationId: fid, id: bid });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    finally { await release(); }
  });

  router.post('/delete-building', async (req,res) => {
    const { foundationId, id, eraseData, dry } = req.body || {};
    if (!foundationId || !id) return res.status(400).json({ error: 'foundationId and id required' });
    const paths = await findDataDirsForBuilding(foundationId, id);
    if (dry) return res.json({ dry:true, dataDirs: paths, willErase: !!eraseData });
    const release = await acquireLock('registry');
    try {
      await audit('delete-building', { foundationId, id, eraseData: !!eraseData }, req);
      const reg = await readJson(REGISTRY_FILE);
      const before = reg.length;
      const next = reg.filter(x => !(x.foundationId === foundationId && x.id === id));
      if (next.length === before) return res.status(404).json({ error: 'building not found' });
      validateRegistry(next);
      await backupRegistry('delete-building');
      if (paths.length && eraseData) await archiveAndMaybeDeleteData(paths, `delete-building-${foundationId}-${id}`, true);
      else if (paths.length)        await archiveAndMaybeDeleteData(paths, `delete-building-${foundationId}-${id}`, false);
      await writeJsonAtomic(REGISTRY_FILE, next);
      res.json({ ok: true, removed: before - next.length, dataDirsFound: paths.length, dataErased: !!eraseData });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    finally { await release(); }
  });

  router.post('/delete-foundation', async (req,res) => {
    const { foundationId, eraseData, dry } = req.body || {};
    if (!foundationId) return res.status(400).json({ error: 'foundationId required' });
    const reg = await readJson(REGISTRY_FILE);
    const buildings = reg.filter(x => x.foundationId === foundationId);
    const allPaths = [];
    for (const b of buildings) {
      const p = await findDataDirsForBuilding(foundationId, b.id);
      allPaths.push(...p);
    }
    if (dry) return res.json({ dry:true, buildings: buildings.map(b=>b.id), dataDirs: allPaths, willErase: !!eraseData });
    const release = await acquireLock('registry');
    try {
      await audit('delete-foundation', { foundationId, eraseData: !!eraseData }, req);
      const next = reg.filter(x => x.foundationId !== foundationId);
      if (next.length === reg.length) return res.status(404).json({ error: 'foundation not found' });
      validateRegistry(next);
      await backupRegistry('delete-foundation');
      if (allPaths.length && eraseData) await archiveAndMaybeDeleteData(allPaths, `delete-foundation-${foundationId}`, true);
      else if (allPaths.length)        await archiveAndMaybeDeleteData(allPaths, `delete-foundation-${foundationId}`, false);
      await writeJsonAtomic(REGISTRY_FILE, next);
      res.json({ ok: true, removed: reg.length - next.length, dataDirsFound: allPaths.length, dataErased: !!eraseData });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    finally { await release(); }
  });

  router.post('/restore', async (req,res) => {
    const { backupId } = req.body || {};
    if (!backupId) return res.status(400).json({ error: 'backupId required' });
    const release = await acquireLock('registry');
    try {
      await audit('restore', { backupId }, req);
      const src = path.join(BACKUP_DIR, backupId);
      if (!fs.existsSync(src)) return res.status(404).json({ error: 'backup not found' });
      const reg = await readJson(src);
      validateRegistry(reg);
      await writeJsonAtomic(REGISTRY_FILE, reg);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
    finally { await release(); }
  });

  return router;
}
