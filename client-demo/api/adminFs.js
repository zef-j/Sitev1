// ESM version of adminFs.js
import fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { REGISTRY_FILE, ADMIN_DIR, BACKUP_DIR, DATA_BKP_DIR, LOCK_DIR, AUDIT_LOG, DATA_ROOT } from './adminConfig.js';

export function ensureDirs() {
  [ADMIN_DIR, BACKUP_DIR, DATA_BKP_DIR, LOCK_DIR].forEach(p => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true, mode: 0o700 });
  });
  if (!fs.existsSync(REGISTRY_FILE)) {
    fs.writeFileSync(REGISTRY_FILE, '[]', { mode: 0o600 });
  }
}

export function nowIsoSafe() {
  return new Date().toISOString().replace(/[:]/g,'-');
}

export function randomId(n=8) {
  return crypto.randomBytes(n).toString('hex');
}

export async function acquireLock(name='registry', timeoutMs=8000, pollMs=150) {
  const dir = path.join(LOCK_DIR, `${name}.lock`);
  const start = Date.now();
  while (true) {
    try {
      await fsp.mkdir(dir, { recursive: false });
      await fsp.writeFile(path.join(dir, 'pid'), String(process.pid));
      return async () => { try { await fsp.rm(dir, { recursive: true, force: true }); } catch {} };
    } catch {
      if (Date.now() - start > timeoutMs) {
        let holder='?'; try{ holder = (await fsp.readFile(path.join(dir,'pid'))).toString(); }catch{}
        throw new Error(`Another edit is in progress (lock held by pid ${holder}). Try again in a moment.`);
      }
      await new Promise(r => setTimeout(r, pollMs));
    }
  }
}

export async function readJson(file) {
  const raw = await fsp.readFile(file, 'utf8').catch(()=> '[]');
  try { return JSON.parse(raw || '[]'); }
  catch (e) { throw new Error(`Invalid JSON in ${file}: ${String(e.message || e)}`); }
}

export async function writeJsonAtomic(file, dataObj) {
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await fsp.writeFile(tmp, JSON.stringify(dataObj, null, 2), { mode: 0o600 });
  await fsp.rename(tmp, file);
}

export async function backupRegistry(tag='manual') {
  const name = `${nowIsoSafe()}-${tag}.json`;
  const dest = path.join(BACKUP_DIR, name);
  await fsp.copyFile(REGISTRY_FILE, dest);
  return { path: dest, id: name };
}

export async function listBackups() {
  ensureDirs();
  const files = await fsp.readdir(BACKUP_DIR).catch(()=>[]);
  const list = [];
  for (const f of files) {
    const p = path.join(BACKUP_DIR, f);
    const st = await fsp.stat(p).catch(()=>null);
    if (st && st.isFile()) list.push({ id: f, size: st.size, mtime: st.mtimeMs });
  }
  list.sort((a,b)=> b.mtime - a.mtime);
  return list;
}

export function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-')
    .replace(/(^-|-$)/g,'');
}

export function validateRegistry(arr) {
  if (!Array.isArray(arr)) throw new Error('Registry must be an array.');
  const ids = new Set();
  const fNames = new Map();
  for (const [i, it] of arr.entries()) {
    const ctx = `entry[${i}]`;
    for (const k of ['id','name','foundationId','foundationName']) {
      if (!it || typeof it[k] !== 'string' || !it[k].trim()) throw new Error(`${ctx}: missing/invalid "${k}".`);
      it[k] = it[k].trim();
    }
    if (ids.has(it.id)) throw new Error(`${ctx}: duplicate id "${it.id}".`);
    ids.add(it.id);
    const prev = fNames.get(it.foundationId);
    if (prev && prev !== it.foundationName) {
      throw new Error(`${ctx}: foundationName mismatch for foundationId "${it.foundationId}" ("${prev}" vs "${it.foundationName}")`);
    }
    fNames.set(it.foundationId, it.foundationName);
  }
  return true;
}

export async function audit(action, payload, req) {
  ensureDirs();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    action, payload,
    ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString(),
    ua: (req.headers['user-agent'] || '').toString(),
  }) + '\n';
  await fsp.appendFile(AUDIT_LOG, line, { mode: 0o600 });
}

export async function findDataDirsForBuilding(foundationId, buildingId) {
  const matches = [];
  const roots = [];
  for (const candidate of ['orgs', 'sites', '.']) {
    const p = path.join(DATA_ROOT, candidate);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) roots.push(p);
  }
  const targetSuffix = path.join('foundations', foundationId, 'buildings', buildingId);
  const pending = [...roots];
  while (pending.length) {
    const cur = pending.shift();
    let ents;
    try { ents = await fsp.readdir(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (full.endsWith(targetSuffix)) matches.push(full);
        else pending.push(full);
      }
    }
  }
  return matches;
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  if (fsp.cp) { await fsp.cp(src, dest, { recursive: true }); return; }
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else await fsp.copyFile(s, d);
  }
}


export async function findFoundationDirs(foundationId){
  const matches = [];
  const roots = [];
  for (const candidate of ['orgs','sites','.']){
    const p = path.join(DATA_ROOT, candidate);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) roots.push(p);
  }
  const targetSuffix = path.join('foundations', foundationId);
  const pending = [...roots];
  while (pending.length){
    const cur = pending.shift();
    let ents;
    try { ents = await fsp.readdir(cur, { withFileTypes:true }); } catch { continue; }
    for (const e of ents){
      const full = path.join(cur, e.name);
      if (e.isDirectory()){
        if (full.endsWith(targetSuffix)) matches.push(full);
        else pending.push(full);
      }
    }
  }
  return matches;
}

export async function safeRename(src, dest){
  await fsp.mkdir(path.dirname(dest), { recursive:true });
  // If destination exists, throw to avoid overwriting
  try {
    const st = await fsp.stat(dest);
    if (st) throw new Error('Destination exists: '+dest);
  } catch {}
  await fsp.rename(src, dest);
}

export async function updateCurrentJsonBuildingId(dir, newId){
  const cur = path.join(dir, 'current.json');
  try {
    const s = await fsp.readFile(cur, 'utf8');
    const j = JSON.parse(s);
    if (j && typeof j === 'object'){
      j.buildingId = newId;
      await fsp.writeFile(cur, JSON.stringify(j, null, 2));
    }
  } catch {}
}

export async function archiveAndMaybeDeleteData(paths, tag, erase) {
  const root = path.join(DATA_BKP_DIR, `${nowIsoSafe()}-${tag}`);
  const archived = [];
  for (const p of paths) {
    const rel = path.relative(DATA_ROOT, p);
    const dest = path.join(root, rel);
    await copyDir(p, dest);
    archived.push({ from: p, to: dest });
    if (erase) await fsp.rm(p, { recursive: true, force: true });
  }
  return { root, archived };
}
