// ESM adminRouter.js — adds change-building-id and change-foundation-id (robust)
import express from 'express';
import fs from 'fs';
import path from 'path';
import { REGISTRY_FILE, SECRET_FILE, BACKUP_DIR, FOUNDATION_ALIASES_FILE } from './adminConfig.js';
import {
  ensureDirs, acquireLock, readJson, writeJsonAtomic,
  backupRegistry, listBackups, validateRegistry, slugify, audit,
  findDataDirsForBuilding, archiveAndMaybeDeleteData
} from './adminFs.js';
import { findBuildingDirByCurrentJson, moveDir } from './adminMove.js';

function readSecret() {
  try { return fs.readFileSync(SECRET_FILE, 'utf8').trim(); } catch { return ''; }
}

function ok(req) {
  const key = (req.headers['x-admin-secret'] || req.query.key || '').toString();
  const secret = readSecret();
  return secret ? (key===secret) : true;
}

function requireOk(req,res){ if (!ok(req)) { res.status(403).json({ error: 'Forbidden' }); return false; } return true; }

async function getRegistry(){ return await readJson(REGISTRY_FILE); }

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

  // --- Guard ---------------------------------------------------------------
  router.use((req,res,next)=>{ if (!requireOk(req,res)) return; next(); });

  // --- Tree / Backups (existing endpoints preserved) -----------------------
  router.get('/registry/tree', async (req,res)=>{
    const reg = await getRegistry();
    const f = treeFromRegistry(reg);
    const counts = { foundations: f.length, buildings: reg.length };
    res.json({ foundations: f, counts });
  });

  router.get('/registry/backups', async (req,res)=>{
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

  // --- Change Building ID (robust move) -----------------------------------
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

      // Update registry
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

  // --- Change Foundation ID -----------------------------------------------
  router.post('/change-foundation-id', async (req,res) => {
    const { oldId, newId } = req.body || {};
    if (!oldId || !newId) return res.status(400).json({ error: 'oldId and newId required' });
    const nid = slugify(newId);
    const reg = await getRegistry();
    if (reg.some(x => x.foundationId === nid)) return res.status(409).json({ error: 'newId already exists' });

    // Derive actual foundation dirs from buildings
    const buildingIds = reg.filter(x=>x.foundationId===oldId).map(x=>x.id);
    const bdirs = [];
    for (const bid of buildingIds) {
      try {
        const d = await findDataDirsForBuilding(oldId, bid);
        bdirs.push(...d);
      } catch {}
    }
    const fset = new Set(); for (const d of bdirs) fset.add(path.dirname(path.dirname(d)));
    const fdirs = Array.from(fset);

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
