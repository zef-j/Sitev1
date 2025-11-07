// adminMove.js — helpers for robust building folder discovery and moves
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { DATA_ROOT } from './adminConfig.js';

export async function findBuildingDirByCurrentJson(buildingId){
  // Scan orgs/*/foundations/*/buildings/*/current.json for a matching buildingId
  const base = path.join(DATA_ROOT, 'orgs');
  const hits = [];
  async function scan(dir){
    let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents){
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await scan(full);
      else if (e.isFile() && e.name==='current.json') {
        try {
          const j = JSON.parse(await fsp.readFile(full, 'utf8'));
          if (j && j.buildingId===buildingId) hits.push(path.dirname(full));
        } catch {}
      }
    }
  }
  await scan(base);
  return hits;
}

export async function moveDir(src, dest){
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fsp.rename(src, dest);
    return true;
  } catch (e) {
    // Fallback across devices or when rename not possible: copy then remove
    async function copyDir(s, d){
      await fsp.mkdir(d, { recursive: true });
      const ents = await fsp.readdir(s, { withFileTypes: true });
      for (const it of ents){
        const s2 = path.join(s, it.name);
        const d2 = path.join(d, it.name);
        if (it.isDirectory()) await copyDir(s2, d2);
        else await fsp.copyFile(s2, d2);
      }
    }
    await copyDir(src, dest);
    await fsp.rm(src, { recursive: true, force: true });
    return true;
  }
}
