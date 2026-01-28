
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

// --- ZIP streaming helpers (STORE, data-descriptor, UTF-8) ---------------
const ZIP_FLAG_DATA_DESCRIPTOR = 0x0008;
const ZIP_FLAG_UTF8 = 0x0800;
const ZIP_METHOD_STORE = 0;

function zipName(name: string) {
  return String(name || '').replace(/\\/g, '/').replace(/^\/+/, '');
}
function zipDirName(name: string) {
  const n = zipName(name);
  return n.endsWith('/') ? n : (n ? n + '/' : '');
}
function dosDateTime(d?: Date | number) {
  const dt = new Date(d ?? Date.now());
  const year = dt.getFullYear();
  const dosTime = ((dt.getHours() & 31) << 11) | ((dt.getMinutes() & 63) << 5) | ((Math.floor(dt.getSeconds() / 2)) & 31);
  const dosDate = (((year - 1980) & 127) << 9) | (((dt.getMonth() + 1) & 15) << 5) | (dt.getDate() & 31);
  return { dosTime, dosDate };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & (-(c & 1)));
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32Update(crc: number, buf: Buffer) {
  let c = crc >>> 0;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return c >>> 0;
}
function crc32Finalize(crc: number) { return (~crc) >>> 0; }

async function writeToRes(res: any, buf: Buffer) {
  if (res.destroyed) throw new Error('Response destroyed');
  const ok = res.write(buf);
  if (!ok) await new Promise<void>((resolve) => res.once('drain', () => resolve()));
}

type ZipStreamCtx = {
  res: any;
  offset: number;
  central: Buffer[];
  entries: number;
};

function createZipCtx(res: any): ZipStreamCtx {
  return { res, offset: 0, central: [], entries: 0 };
}

async function addZipEntryFromBuffer(ctx: ZipStreamCtx, name: string, data: Buffer, mtime?: Date | number) {
  const res = ctx.res;
  const fileName = zipName(name);
  const nameBuf = Buffer.from(fileName, 'utf8');
  const { dosTime, dosDate } = dosDateTime(mtime);

  const localOffset = ctx.offset;

  // Local file header (with data-descriptor: CRC and sizes written after data)
  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4); // version
  lh.writeUInt16LE(ZIP_FLAG_DATA_DESCRIPTOR | ZIP_FLAG_UTF8, 6);
  lh.writeUInt16LE(ZIP_METHOD_STORE, 8);
  lh.writeUInt16LE(dosTime, 10);
  lh.writeUInt16LE(dosDate, 12);
  lh.writeUInt32LE(0, 14); // crc placeholder
  lh.writeUInt32LE(0, 18); // comp size placeholder
  lh.writeUInt32LE(0, 22); // uncomp size placeholder
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);

  await writeToRes(res, lh); ctx.offset += lh.length;
  await writeToRes(res, nameBuf); ctx.offset += nameBuf.length;

  let crc = 0xFFFFFFFF;
  crc = crc32Update(crc, data);
  const size = data.length >>> 0;

  await writeToRes(res, data); ctx.offset += data.length;

  const crcFinal = crc32Finalize(crc);

  // Data descriptor (with signature)
  const dd = Buffer.alloc(16);
  dd.writeUInt32LE(0x08074b50, 0);
  dd.writeUInt32LE(crcFinal, 4);
  dd.writeUInt32LE(size, 8);
  dd.writeUInt32LE(size, 12);
  await writeToRes(res, dd); ctx.offset += dd.length;

  // Central directory
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4); // version made
  cd.writeUInt16LE(20, 6); // version needed
  cd.writeUInt16LE(ZIP_FLAG_DATA_DESCRIPTOR | ZIP_FLAG_UTF8, 8);
  cd.writeUInt16LE(ZIP_METHOD_STORE, 10);
  cd.writeUInt16LE(dosTime, 12);
  cd.writeUInt16LE(dosDate, 14);
  cd.writeUInt32LE(crcFinal, 16);
  cd.writeUInt32LE(size, 20);
  cd.writeUInt32LE(size, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30); // extra
  cd.writeUInt16LE(0, 32); // comment
  cd.writeUInt16LE(0, 34); // disk start
  cd.writeUInt16LE(0, 36); // internal attrs
  cd.writeUInt32LE(0, 38); // external attrs
  cd.writeUInt32LE(localOffset >>> 0, 42);

  ctx.central.push(cd, nameBuf);
  ctx.entries += 1;
}

async function addZipEntryFromPath(ctx: ZipStreamCtx, name: string, filePath: string, mtime?: Date | number) {
  const res = ctx.res;
  const fileName = zipName(name);
  const nameBuf = Buffer.from(fileName, 'utf8');
  const { dosTime, dosDate } = dosDateTime(mtime);

  const localOffset = ctx.offset;

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(ZIP_FLAG_DATA_DESCRIPTOR | ZIP_FLAG_UTF8, 6);
  lh.writeUInt16LE(ZIP_METHOD_STORE, 8);
  lh.writeUInt16LE(dosTime, 10);
  lh.writeUInt16LE(dosDate, 12);
  lh.writeUInt32LE(0, 14);
  lh.writeUInt32LE(0, 18);
  lh.writeUInt32LE(0, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);

  await writeToRes(res, lh); ctx.offset += lh.length;
  await writeToRes(res, nameBuf); ctx.offset += nameBuf.length;

  let crc = 0xFFFFFFFF;
  let size = 0;

  const rs = fs.createReadStream(filePath);
  for await (const chunk of rs) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    crc = crc32Update(crc, b);
    size += b.length;
    await writeToRes(res, b);
    ctx.offset += b.length;
  }

  const crcFinal = crc32Finalize(crc) >>> 0;
  const s32 = (size >>> 0);

  const dd = Buffer.alloc(16);
  dd.writeUInt32LE(0x08074b50, 0);
  dd.writeUInt32LE(crcFinal, 4);
  dd.writeUInt32LE(s32, 8);
  dd.writeUInt32LE(s32, 12);
  await writeToRes(res, dd); ctx.offset += dd.length;

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(ZIP_FLAG_DATA_DESCRIPTOR | ZIP_FLAG_UTF8, 8);
  cd.writeUInt16LE(ZIP_METHOD_STORE, 10);
  cd.writeUInt16LE(dosTime, 12);
  cd.writeUInt16LE(dosDate, 14);
  cd.writeUInt32LE(crcFinal, 16);
  cd.writeUInt32LE(s32, 20);
  cd.writeUInt32LE(s32, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(localOffset >>> 0, 42);

  ctx.central.push(cd, nameBuf);
  ctx.entries += 1;
}

async function addZipDir(ctx: ZipStreamCtx, name: string, mtime?: Date | number) {
  // Directories are zero-length entries ending with /
  const dirName = zipDirName(name);
  if (!dirName) return;
  await addZipEntryFromBuffer(ctx, dirName, Buffer.alloc(0), mtime);
}

async function finalizeZip(ctx: ZipStreamCtx) {
  const res = ctx.res;
  const centralStart = ctx.offset;

  for (const b of ctx.central) {
    await writeToRes(res, b);
    ctx.offset += b.length;
  }

  const centralSize = ctx.offset - centralStart;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(ctx.entries & 0xFFFF, 8);
  eocd.writeUInt16LE(ctx.entries & 0xFFFF, 10);
  eocd.writeUInt32LE(centralSize >>> 0, 12);
  eocd.writeUInt32LE(centralStart >>> 0, 16);
  eocd.writeUInt16LE(0, 20);
  await writeToRes(res, eocd);
  ctx.offset += eocd.length;
}

function normZipPrefix(prefix: string){
  const p = zipDirName(prefix);
  return p;
}

async function addBuildingPayloadToZipStream(ctx: ZipStreamCtx, meta: BuildingMeta, prefix: string, tplJson?: string | null){
  ensureCurrent(meta);
  const { currentJson, filesDir } = getPaths(meta);
  const curBuf = fs.readFileSync(currentJson);
  const pfx = normZipPrefix(prefix);
  const at = (rel: string) => `${pfx}${rel}`;

  await addZipDir(ctx, at('rawData/'));
  await addZipDir(ctx, at('files/'));
  await addZipDir(ctx, at('excel/'));

  await addZipEntryFromBuffer(ctx, at('rawData/current.json'), curBuf, fs.statSync(currentJson).mtime);

  if (fs.existsSync(filesDir)) {
    for (const fn of fs.readdirSync(filesDir)) {
      const p = path.join(filesDir, fn);
      if (fs.statSync(p).isFile()) {
        const st = fs.statSync(p);
        await addZipEntryFromPath(ctx, at(`files/${fn}`), p, st.mtime);
      }
    }
  }

  if (tplJson) {
    try{
      const excelBuf = await buildExcelBuffer(tplJson, curBuf.toString('utf8'));
      const excelName = `${safeName(meta.foundationName || 'Fondation')}_${safeName(meta.name || meta.id)}.xlsx`;
      await addZipEntryFromBuffer(ctx, at(`excel/${excelName}`), excelBuf, Date.now());
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

    const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
    const rootFolder = `all_foundations_snapshot-${ts}`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${rootFolder}.zip"`);
    res.setHeader('Cache-Control', 'no-store');
    // start streaming early (helps proxies/timeouts)
    // @ts-ignore - optional in some Node/Express builds
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const ctx = createZipCtx(res);
    await addZipDir(ctx, `${rootFolder}/`);

    for (const { fid, fname, buildings } of byFoundation.values()){
      const foundationFolder = `${safeName(fname)}_${safeName(fid)}`;
      await addZipDir(ctx, `${rootFolder}/${foundationFolder}/`);

      if (buildings.length <= 1) {
        const meta = buildings[0];
        if (meta) await addBuildingPayloadToZipStream(ctx, meta, `${rootFolder}/${foundationFolder}`, tplJson);
        continue;
      }

      for (const meta of buildings){
        const buildingFolder = `${safeName(meta.name || meta.id)}_${safeName(meta.id)}`;
        await addZipDir(ctx, `${rootFolder}/${foundationFolder}/${buildingFolder}/`);
        await addBuildingPayloadToZipStream(ctx, meta, `${rootFolder}/${foundationFolder}/${buildingFolder}`, tplJson);
      }
    }

    await finalizeZip(ctx);
    res.end();
  }catch(e:any){
    console.error(e);
    if (!res.headersSent) res.status(500).json({ error: String(e?.message || e) });
    else { try { res.end(); } catch {} }
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
