
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
  const foundationId = locateExistingFoundationFolder(meta.id) || meta.foundationId || 'f_default';
  const base = path.join(DATA_ROOT, 'orgs', CLIENT_ID, 'foundations', foundationId, 'buildings', meta.id);
  return {
    currentJson: path.join(base, 'current.json'),
    filesDir: path.join(base, 'files'),
    versionsDir: path.join(base, 'versions'),
  };
}

function locateExistingFoundationFolder(buildingId: string): string | null {
  try {
    const foundationsRoot = path.join(DATA_ROOT, 'orgs', CLIENT_ID, 'foundations');
    if (!fs.existsSync(foundationsRoot)) return null;
    const entries = fs.readdirSync(foundationsRoot, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const candidate = path.join(foundationsRoot, ent.name, 'buildings', buildingId);
      if (fs.existsSync(candidate)) return ent.name;
    }
  } catch {}
  return null;
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

function normZipPrefix(prefix: string){
  const p = (prefix || '')
    .replace(/\\/g,'/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  return p ? p + '/' : '';
}

async function addBuildingPayloadToZip(zip: JSZip, meta: BuildingMeta, prefix: string, tplJson?: string | null){
  ensureCurrent(meta);
  const { currentJson, filesDir } = getPaths(meta);
  const curBuf = fs.readFileSync(currentJson);
  const pfx = normZipPrefix(prefix);
  const at = (rel: string) => `${pfx}${rel}`;

  zip.file(at('rawData/current.json'), curBuf);

  if (fs.existsSync(filesDir)) {
    for (const fn of fs.readdirSync(filesDir)) {
      const p = path.join(filesDir, fn);
      if (fs.statSync(p).isFile()) {
        zip.file(at(`files/${fn}`), fs.readFileSync(p));
      }
    }
  }

  if (tplJson) {
    try{
      const excelBuf = await buildExcelBuffer(tplJson, curBuf.toString('utf8'));
      const excelName = `${safeName(meta.foundationName || 'Fondation')}_${safeName(meta.name || meta.id)}.xlsx`;
      zip.file(at(`excel/${excelName}`), excelBuf);
    }catch(e){ console.error('excel build failed', e); }
  }
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

// --- Full snapshot (all foundations as folders, in one ZIP) ---------------
router.get('/download/all-foundations', async (_req, res) => {
  try{
    const all = getRegistry();

    const byFoundation = new Map<string, { fid: string; fname: string; buildings: BuildingMeta[] }>();
    for (const meta of all) {
      const fid = meta.foundationId || 'f_default';
      const fname = meta.foundationName || fid;
      if (!byFoundation.has(fid)) byFoundation.set(fid, { fid, fname, buildings: [] });
      byFoundation.get(fid)!.buildings.push(meta);
    }

    const tplPath = path.join(DATA_ROOT, 'templates', 'active.json');
    const tplJson = fs.existsSync(tplPath) ? fs.readFileSync(tplPath, 'utf8') : null;

    const zip = new JSZip();
    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
    const rootFolder = `all_foundations_snapshot-${ts}`;
    zip.folder(rootFolder);

    for (const { fid, fname, buildings } of byFoundation.values()){
      const foundationFolder = `${safeName(fname)}_${safeName(fid)}`;
      zip.folder(`${rootFolder}/${foundationFolder}`);

      if (buildings.length <= 1) {
        const meta = buildings[0];
        if (meta) await addBuildingPayloadToZip(zip, meta, `${rootFolder}/${foundationFolder}`, tplJson);
        continue;
      }

      for (const meta of buildings){
        const buildingFolder = `${safeName(meta.name || meta.id)}_${safeName(meta.id)}`;
        zip.folder(`${rootFolder}/${foundationFolder}/${buildingFolder}`);
        await addBuildingPayloadToZip(zip, meta, `${rootFolder}/${foundationFolder}/${buildingFolder}`, tplJson);
      }
    }

    const out = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Length', String(out.length));
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${rootFolder}.zip"`);
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
