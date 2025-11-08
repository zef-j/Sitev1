// tools/audit-registry.mjs (FIXED)
// Audit that registry (buildings.json) matches on-disk folders.
//
// Usage:
//   DATA_ROOT=/srv/customer/var/se-cpval/data node tools/audit-registry.mjs | jq .
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve DATA_ROOT similar to the API config
function readPointerFile(p) {
  try { const s = fs.readFileSync(p, 'utf8').trim(); if (s) return s; } catch {}
  return null;
}
function resolveDataRoot() {
  if (process.env.DATA_ROOT && fs.existsSync(process.env.DATA_ROOT)) return process.env.DATA_ROOT;
  const candidates = [
    path.resolve(__dirname, '../client-demo/api/data'),
    path.resolve(__dirname, '../_data'),
    readPointerFile(path.resolve(__dirname, '../client-demo/api/data')),
    readPointerFile(path.resolve(__dirname, '../_data')),
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return path.resolve(__dirname, '../client-demo/api/data');
}
const DATA_ROOT = resolveDataRoot();

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

const REGISTRY_PATH = path.join(DATA_ROOT, 'buildings.json');
const registry = readJSON(REGISTRY_PATH, []);

function* walk(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let arr = [];
    try { arr = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of arr) {
      const full = path.join(cur, e.name);
      yield { full, entry: e };
      if (e.isDirectory()) stack.push(full);
    }
  }
}
function expectedDir(foundationId, buildingId) {
  return path.join(DATA_ROOT, 'orgs', 'main', 'foundations', foundationId, 'buildings', buildingId);
}

// Collect actual building dirs on disk
const seenOnDisk = [];
for (const { full, entry } of walk(path.join(DATA_ROOT, 'orgs'))) {
  if (!entry.isDirectory()) continue;
  // We only care about directories whose path contains ".../foundations/<foundationId>/buildings/<buildingId>"
  const parts = full.split(path.sep);
  const iB = parts.lastIndexOf('buildings');
  if (iB > 0 && parts.length > iB + 1) {
    const buildingId = parts[iB + 1];
    // FIX: foundationId is the segment right before "buildings", and the segment before that must be "foundations"
    if (parts[iB - 2] === 'foundations') {
      const foundationId = parts[iB - 1];
      seenOnDisk.push({ buildingId, foundationId, dir: full });
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

const regById = new Map(registry.map(b => [b.id, b]));

// 1) Every registry entry must exist at expected path
for (const b of registry) {
  const exp = expectedDir(b.foundationId, b.id);
  if (!fs.existsSync(exp)) {
    // Maybe it exists elsewhere (wrong foundation)? collect all locations with same buildingId
    const found = seenOnDisk.filter(x => x.buildingId === b.id);
    if (found.length) {
      rep.wrongLocation.push({ buildingId: b.id, foundationId: b.foundationId, expected: exp, found: found.map(f => f.dir) });
    } else {
      rep.missingOnDisk.push({ buildingId: b.id, foundationId: b.foundationId, expected: exp });
    }
  }
  // Sanity check for aliases colliding with real ids
  if (Array.isArray(b.aliases)) {
    for (const al of b.aliases) {
      if (regById.has(al)) {
        rep.aliasWarnings.push({ buildingId: b.id, alias: al, warning: 'Alias also exists as a real ID in registry.' });
      }
    }
  }
}

// 2) Stray building dirs not in registry (by id)
for (const hit of seenOnDisk) {
  if (!regById.has(hit.buildingId)) {
    rep.strayOnDisk.push(hit);
  }
}

console.log(JSON.stringify(rep, null, 2));
