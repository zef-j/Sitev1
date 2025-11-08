// tools/normalize-building-folders.mjs
// Move/merge building directories so they match the canonical registry path:
//   DATA_ROOT/orgs/main/foundations/<foundationId>/buildings/<buildingId>
//
// DRY-RUN by default. Set RUN=1 to actually perform moves.
// Usage:
//   node tools/normalize-building-folders.mjs
//   RUN=1 node tools/normalize-building-folders.mjs
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { expectedBuildingDir, findBuildingDirsByCurrentJson, moveDirWithMerge, readJsonSafe } from '../client-demo/api/adminMove.js';
import { updateCurrentJsonBuildingId } from '../client-demo/api/adminFs.js';
import cfg from '../client-demo/api/adminConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { DATA_ROOT, REGISTRY_FILE } = cfg;

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}

const registry = readJSON(REGISTRY_FILE, []);
const run = process.env.RUN === '1';

async function normalizeOne(b) {
  const exp = expectedBuildingDir(b.foundationId, b.id);
  if (fs.existsSync(exp)) return { buildingId: b.id, status: 'ok', dest: exp };
  const candidates = await findBuildingDirsByCurrentJson(b.id);
  if (!candidates.length) return { buildingId: b.id, status: 'missing', dest: exp };
  // prefer the one under the right foundation if present
  let src = candidates.find(p => p.includes(path.sep + b.foundationId + path.sep)) || candidates[0];
  if (!run) return { buildingId: b.id, status: 'would-move', from: src, to: exp };
  const { merged, moved } = await moveDirWithMerge(src, exp);
  await updateCurrentJsonBuildingId(exp, b.id);
  return { buildingId: b.id, status: merged ? 'merged' : (moved ? 'moved' : 'noop'), from: src, to: exp };
}

(async () => {
  const results = [];
  for (const b of registry) {
    // skip ones that look like test entries
    results.push(await normalizeOne(b));
  }
  console.log(JSON.stringify({ dataRoot: DATA_ROOT, run, results }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
