
// client-demo/api/src/routes/downloads.ts
import express from 'express';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';

// @ts-ignore - compiled JS only
import { buildExcelBuffer } from '../excelExport.js';
// our own global overview builder
import { buildGlobalOverviewBuffer } from '../globalOverview.js';

export const router = express.Router();

const DATA_ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : path.resolve(process.cwd(), './data');
const CLIENT_ID = process.env.CLIENT_ID || 'main';

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function readJSON<T=any>(p: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJSON(p: string, obj: any) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function nowIso(){ return new Date().toISOString(); }

type BuildingMeta = { id: string; name?: string; foundationId?: string; foundationName?: string };

function getRegistry(): BuildingMeta[] {
  const p = path.join(DATA_ROOT, 'buildings.json');
  return readJSON<BuildingMeta[]>(p, []);
}
function getBuildingMeta(id: string): BuildingMeta {
  const all = getRegistry();
  const meta = all.find(b => b.id === id);
  return meta || { id, name: `Bâtiment ${id}`, foundationId: 'f_default', foundationName: 'Default' };
}
function getPaths(meta: BuildingMeta){
  const foundationId = meta.foundationId || 'f_default';
  const base = path.join(DATA_ROOT, 'orgs', CLIENT_ID, 'foundations', foundationId, 'buildings', meta.id);
  return {
    currentJson: path.join(base, 'current.json'),
    filesDir: path.join(base, 'files'),
    versionsDir: path.join(base, 'versions'),
  };
}
function ensureCurrent(meta: BuildingMeta){
  const { currentJson } = getPaths(meta);
  if (!fs.existsSync(currentJson)) {
    writeJSON(currentJson, {
      buildingId: meta.id,
      templateVersion: 'dev',
      dataVersion: 1,
      data: {},
      filesIndex: {}
    });
  }
}

function safeName(t: string){
  return (t || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/-+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,80) || 'item';
}

// --- Download current.json + files + Excel as ZIP -------------------------
router.get('/buildings/:id/download', async (req, res) => {
  try{
    const id = req.params.id;
    const meta = getBuildingMeta(id);
    ensureCurrent(meta);
    const { currentJson, filesDir } = getPaths(meta);

    const curBuf = fs.readFileSync(currentJson);
    const zip = new JSZip();
    zip.file('rawData/current.json', curBuf);

    if (fs.existsSync(filesDir)) {
      for (const fn of fs.readdirSync(filesDir)) {
        const p = path.join(filesDir, fn);
        if (fs.statSync(p).isFile()) {
          zip.file(`files/${fn}`, fs.readFileSync(p));
        }
      }
    }

    // Excel (if template exists)
    const tplPath = path.join(DATA_ROOT, 'templates', 'active.json');
    if (fs.existsSync(tplPath)) {
      try{
        const tpl = fs.readFileSync(tplPath, 'utf8');
        const excelBuf = await buildExcelBuffer(tpl, curBuf.toString('utf8'));
        const excelName = `${safeName(meta.foundationName || 'Fondation')}_${safeName(meta.name || id)}.xlsx`;
        zip.file(`excel/${excelName}`, excelBuf);
      }catch(e){ console.error('excel build failed', e); }
    }

    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
    const zipBase = `${safeName(meta.foundationName || 'Fondation')}-${safeName(meta.name || id)}-${ts}`;
    const out = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipBase}.zip"`);
    res.send(out);
  }catch(e:any){
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});



// --- Download ALL foundations snapshot as single ZIP -----------------------
router.get('/download/all-foundations', async (_req, res) => {
  try{
    const registry = getRegistry();

    const tplPath = path.join(DATA_ROOT, 'templates', 'active.json');
    const tpl = fs.existsSync(tplPath) ? fs.readFileSync(tplPath, 'utf8') : null;

    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
    const rootFolder = `all_foundations_${ts}`;

    const usedFoundationFolders = new Set<string>();
    const foundationFolderById = new Map<string,string>();
    const usedBuildingFoldersByFoundation = new Map<string, Set<string>>();

    const unique = (base: string, used: Set<string>) => {
      let s = base;
      let i = 2;
      while (used.has(s)) s = `${base}-${i++}`;
      used.add(s);
      return s;
    };

    const zip = new JSZip();

    for (const it of registry) {
      const id = it?.id;
      if (!id) continue;

      const meta: BuildingMeta = {
        id,
        name: it.name || id,
        foundationId: it.foundationId || 'f_default',
        foundationName: it.foundationName || it.foundationId || 'Default',
      };

      ensureCurrent(meta);
      const { currentJson, filesDir } = getPaths(meta);
      const curBuf = fs.readFileSync(currentJson);

      const fid = meta.foundationId || 'f_default';
      let fFolder = foundationFolderById.get(fid);
      if (!fFolder) {
        const base = safeName(meta.foundationName || fid || 'foundation') || safeName(fid) || 'foundation';
        let candidate = base;
        if (usedFoundationFolders.has(candidate)) candidate = `${candidate}-${safeName(fid) || fid}`;
        fFolder = unique(candidate, usedFoundationFolders);
        foundationFolderById.set(fid, fFolder);
      }

      let bUsed = usedBuildingFoldersByFoundation.get(fid);
      if (!bUsed) { bUsed = new Set<string>(); usedBuildingFoldersByFoundation.set(fid, bUsed); }

      const bBase = safeName(meta.name || id) || safeName(id) || 'building';
      let bCandidate = bBase;
      if (bUsed.has(bCandidate)) bCandidate = `${bCandidate}-${safeName(id) || id}`;
      const bFolder = unique(bCandidate, bUsed);

      zip.file(`${rootFolder}/${fFolder}/${bFolder}/rawData/current.json`, curBuf);

      if (fs.existsSync(filesDir)) {
        for (const fn of fs.readdirSync(filesDir)) {
          const fp = path.join(filesDir, fn);
          if (fs.statSync(fp).isFile()) {
            zip.file(`${rootFolder}/${fFolder}/${bFolder}/files/${fn}`, fs.readFileSync(fp));
          }
        }
      }

      if (tpl) {
        try{
          const excelBuf = await buildExcelBuffer(tpl, curBuf.toString('utf8'));
          const excelName = `${safeName(meta.foundationName || 'Fondation')}_${safeName(meta.name || id)}.xlsx`;
          zip.file(`${rootFolder}/${fFolder}/${bFolder}/excel/${excelName}`, excelBuf);
        }catch(e){ console.error('excel build failed', e); }
      }
    }

    const out = await zip.generateAsync({ type: 'nodebuffer' });
    const fname = `all_foundations-${ts}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(out);
  }catch(e:any){
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});
// --- Global overview (Excel) ----------------------------------------------
router.get('/download/global-overview', async (_req, res) => {
  try{
    const tplPath = path.join(DATA_ROOT, 'templates', 'active.json');
    const tplJson = fs.existsSync(tplPath) ? fs.readFileSync(tplPath, 'utf8') : JSON.stringify({ version:'dev', sections: [] });

    const items = getRegistry().map(meta => {
      const m = meta;
      const { currentJson } = getPaths(m);
      ensureCurrent(m);
      const cur = readJSON<any>(currentJson, {});
      const label = `${m.foundationName || m.foundationId || 'Foundation'}_${m.name || m.id}`;
      return { label, current: cur };
    });

    const buf = await buildGlobalOverviewBuffer(tplJson, items);
    const fname = `global_overview-${new Date().toISOString().slice(0,16).replace(/[:T]/g,'-')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.send(buf);
  }catch(e:any){
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});
