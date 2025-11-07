// adminMove.js — robust discovery and move/merge of building directories
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { DATA_ROOT } from './adminConfig.js';

export async function existsDir(p){
  try { return (await fsp.stat(p)).isDirectory(); } catch { return false; }
}

export function expectedBuildingDir(foundationId, buildingId){
  return path.join(DATA_ROOT, 'orgs', 'main', 'foundations', foundationId, 'buildings', buildingId);
}

export async function findBuildingDirsByCurrentJson(buildingId){
  // Scan orgs/*/foundations/*/buildings/*/current.json for a matching buildingId
  const base = path.join(DATA_ROOT, 'orgs');
  const hits = [];
  async function scan(dir, depth=0){
    if (depth>6) return;
    let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents){
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Quick prune: only descend plausible dirs
        if (full.includes(path.sep+'buildings'+path.sep) || depth<3) await scan(full, depth+1);
      } else if (e.isFile() && e.name==='current.json' && full.includes(path.sep+'buildings'+path.sep)) {
        try {
          const j = JSON.parse(await fsp.readFile(full, 'utf8'));
          if (j && j.buildingId===buildingId) hits.push(path.dirname(full));
        } catch {}
      }
    }
  }
  await scan(base, 0);
  return hits;
}

async function copyDir(src, dest){
  await fsp.mkdir(dest, { recursive: true });
  const ents = await fsp.readdir(src, { withFileTypes: true });
  for (const it of ents){
    const s2 = path.join(src, it.name);
    const d2 = path.join(dest, it.name);
    if (it.isDirectory()) await copyDir(s2, d2);
    else await fsp.copyFile(s2, d2);
  }
}

export async function moveDir(src, dest){
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fsp.rename(src, dest);
    return true;
  } catch {
    await copyDir(src, dest);
    await fsp.rm(src, { recursive: true, force: true });
    return true;
  }
}

// Merge src into dest if dest already exists; then remove src
export async function moveDirWithMerge(src, dest){
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  if (await existsDir(dest)){
    if (await existsDir(src)){
      await copyDir(src, dest);
      await fsp.rm(src, { recursive: true, force: true });
      return { merged: true, moved: true };
    }
    return { merged: false, moved: false };
  } else {
    if (await existsDir(src)){
      try { await fsp.rename(src, dest); return { merged:false, moved:true }; }
      catch { await copyDir(src, dest); await fsp.rm(src, { recursive:true, force:true }); return { merged:true, moved:true }; }
    }
    return { merged:false, moved:false };
  }
}

export async function readJsonSafe(p){
  try { return JSON.parse(await fsp.readFile(p, 'utf8')); } catch { return null; }
}
