// tools/audit-registry.mjs
// Audit that registry (buildings.json) matches on-disk folders.
// Usage:
//   node tools/audit-registry.mjs
//   DATA_ROOT=/srv/customer/var/se-cpval/data node tools/audit-registry.mjs
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve DATA_ROOT the same way the API does, with fallbacks
function readPointerFile(p) {
  try { const s = fs.readFileSync(p, 'utf8').trim(); if (s) return s; } catch {}
  return null;
}
function resolveDataRoot() {
  if (process.env.DATA_ROOT && fs.existsSync(process.env.DATA_ROOT)) return process.env.DATA_ROOT;
  const tries = [
    path.resolve(__dirname, '../client-demo/api/data'),
    path.resolve(__dirname, '../_data'),
    readPointerFile(path.resolve(__dirname, '../client-demo/api/data')) || null,
    readPointerFile(path.resolve(__dirname, '../_data')) || null,
  ].filter(Boolean);
  for (const p of tries) if (fs.existsSync(p)) return p;
  return path.resolve(__dirname, '../client-demo/api/data');
}
const DATA_ROOT = resolveDataRoot();

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

const REGISTRY_PATH = path.join(DATA_ROOT, 'buildings.json');
const registry = readJSON(REGISTRY_PATH, []);

function expectedDir(foundationId, buildingId) {
  return path.join(DATA_ROOT, 'orgs', 'main', 'foundations', foundationId, 'buildings', buildingId);
}

function* walk(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let arr;
    try { arr = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of arr) {
      const full = path.join(cur, e.name);
      yield { full, entry: e };
      if (e.isDirectory()) stack.push(full);
    }
  }
}

// Collect actual building dirs on disk
const seenOnDisk = [];
for (const { full, entry } of walk(path.join(DATA_ROOT, 'orgs'))) {
  if (!entry.isDirectory()) continue;
  if (full.includes(path.sep + 'buildings' + path.sep)) {
    const parts = full.split(path.sep);
    const iB = parts.lastIndexOf('buildings');
    if (iB >= 1 && parts[iB+1]) {
      const buildingId = parts[iB+1];
      const foundationId = (parts[iB-1] === 'foundations') ? parts[iB-2] : null;
      if (foundationId) seenOnDisk.push({ buildingId, foundationId, dir: full });
    }
  }
}

const rep = {
  dataRoot: DATA_ROOT,
  registryCount: registry.length,
  diskCount: seenOnDisk.length,
  missingOnDisk: [],
  wrongLocation: [],
  strayOnDisk: [],
  aliasWarnings: [],
};

const regMap = new Map(registry.map(b => [b.id, b]));

// 1) Check: every registry entry exists on disk at expected path
for (const b of registry) {
  const exp = expectedDir(b.foundationId, b.id);
  if (!fs.existsSync(exp)) {
    const found = seenOnDisk.filter(x => x.buildingId === b.id);
    if (found.length) {
      rep.wrongLocation.push({ buildingId: b.id, foundationId: b.foundationId, expected: exp, found: found.map(f => f.dir) });
    } else {
      rep.missingOnDisk.push({ buildingId: b.id, foundationId: b.foundationId, expected: exp });
    }
  }
  if (Array.isArray(b.aliases)) {
    for (const al of b.aliases) {
      if (regMap.has(al)) {
        rep.aliasWarnings.push({ buildingId: b.id, alias: al, warning: 'Alias also exists as a real ID in registry.' });
      }
    }
  }
}

// 2) Check: stray building dirs not referenced by registry
for (const hit of seenOnDisk) {
  if (!regMap.has(hit.buildingId)) {
    // Could be an alias — we’ll note it as stray; admin can decide
    rep.strayOnDisk.push(hit);
  }
}

console.log(JSON.stringify(rep, null, 2));
