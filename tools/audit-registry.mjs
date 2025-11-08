// tools/audit-registry.mjs (REFINED: count only building roots)
// Audit that registry (buildings.json) matches on-disk folders.
// Counts only directories exactly matching:
//   .../foundations/<foundationId>/buildings/<buildingId>
//
// Usage:
//   DATA_ROOT=/srv/customer/var/se-cpval/data node tools/audit-registry.mjs | jq .
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function* walkDirs(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let arr = [];
    try { arr = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of arr) {
      if (!e.isDirectory()) continue;
      const full = path.join(cur, e.name);
      yield full;
      stack.push(full);
    }
  }
}
function isBuildingRoot(p) {
  const parts = p.split(path.sep);
  const iB = parts.lastIndexOf('buildings');
  // Must be .../foundations/<foundationId>/buildings/<buildingId>
  return iB > 0 &&
         parts[iB - 1] === 'foundations' &&            // parent of 'buildings' is 'foundations'
         iB + 1 === parts.length - 1;                  // exactly one segment after 'buildings' (the buildingId)
}
function extractIds(p) {
  const parts = p.split(path.sep);
  const iB = parts.lastIndexOf('buildings');
  return {
    foundationId: parts[iB - 2],
    buildingId: parts[iB + 1],
  };
}
function expectedDir(foundationId, buildingId) {
  return path.join(DATA_ROOT, 'orgs', 'main', 'foundations', foundationId, 'buildings', buildingId);
}

// Collect building ROOT dirs on disk
const buildingRoots = [];
for (const full of walkDirs(path.join(DATA_ROOT, 'orgs'))) {
  if (isBuildingRoot(full)) {
    const { foundationId, buildingId } = extractIds(full);
    buildingRoots.push({ buildingId, foundationId, dir: full });
  }
}

const rep = {
  dataRoot: DATA_ROOT,
  registryCount: registry.length,
  diskCount: buildingRoots.length,  // now equals number of root dirs, not subfolders
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
    const found = buildingRoots.filter(x => x.buildingId === b.id);
    if (found.length) {
      rep.wrongLocation.push({ buildingId: b.id, foundationId: b.foundationId, expected: exp, found: found.map(f => f.dir) });
    } else {
      rep.missingOnDisk.push({ buildingId: b.id, foundationId: b.foundationId, expected: exp });
    }
  }
  if (Array.isArray(b.aliases)) {
    for (const al of b.aliases) {
      if (regById.has(al)) {
        rep.aliasWarnings.push({ buildingId: b.id, alias: al, warning: 'Alias also exists as a real ID in registry.' });
      }
    }
  }
}

// 2) Stray building root dirs not in registry (by id)
for (const hit of buildingRoots) {
  if (!regById.has(hit.buildingId)) {
    rep.strayOnDisk.push(hit);
  }
}

console.log(JSON.stringify(rep, null, 2));
