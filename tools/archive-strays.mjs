// tools/archive-strays.mjs
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
const regIds = new Set(registry.map(b => b.id));

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
  return iB > 1 &&
         parts[iB - 2] === 'foundations' &&
         iB + 1 === parts.length - 1;
}
function extractIds(p) {
  const parts = p.split(path.sep);
  const iB = parts.lastIndexOf('buildings');
  return { foundationId: parts[iB - 1], buildingId: parts[iB + 1], dir: p };
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

async function moveDir(src, dest) {
  ensureDir(path.dirname(dest));
  try {
    fs.renameSync(src, dest);
    return { moved: true, copied: false };
  } catch {
    // copy recursively
    const stack = [{ from: src, to: dest }];
    while (stack.length) {
      const { from, to } = stack.pop();
      const st = fs.statSync(from);
      if (st.isDirectory()) {
        ensureDir(to);
        for (const e of fs.readdirSync(from)) {
          stack.push({ from: path.join(from, e), to: path.join(to, e) });
        }
      } else {
        ensureDir(path.dirname(to));
        fs.copyFileSync(from, to);
      }
    }
    // remove src recursively
    const rm = [src];
    while (rm.length) {
      const cur = rm.pop();
      const st2 = fs.statSync(cur);
      if (st2.isDirectory()) {
        for (const e of fs.readdirSync(cur)) rm.push(path.join(cur, e));
        fs.rmdirSync(cur);
      } else {
        fs.unlinkSync(cur);
      }
    }
    return { moved: false, copied: true };
  }
}

const run = process.env.RUN === '1';

const roots = [];
for (const full of walkDirs(path.join(DATA_ROOT, 'orgs'))) {
  if (isBuildingRoot(full)) roots.push(full);
}
const strayRoots = roots
  .map(extractIds)
  .filter(x => !regIds.has(x.buildingId));

const results = [];
for (const s of strayRoots) {
  const dest = path.join(DATA_ROOT, '_archive', s.foundationId, s.buildingId);
  if (!run) {
    results.push({ buildingId: s.buildingId, foundationId: s.foundationId, action: 'would-move', from: s.dir, to: dest });
  } else {
    const r = await moveDir(s.dir, dest);
    results.push({ buildingId: s.buildingId, foundationId: s.foundationId, action: r.moved ? 'moved' : 'copied', from: s.dir, to: dest });
  }
}

console.log(JSON.stringify({ dataRoot: DATA_ROOT, run, count: strayRoots.length, results }, null, 2));
