import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

type VersionListItem = { versionId: string; createdAt: string; dataVersion: number };

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

process.on('unhandledRejection', (e) => console.error('UNHANDLED_REJECTION', e));
process.on('uncaughtException',  (e) => console.error('UNCAUGHT_EXCEPTION', e));


const PORT = process.env.PORT || 3000;
const DATA_ROOT = process.env.DATA_ROOT ? path.resolve(process.env.DATA_ROOT) : path.resolve(process.cwd(), './data');
const CLIENT_ID = process.env.CLIENT_ID || 'main';

type FilesIndex = Record<string, string>;
type Data = {
  templateVersion?: string;
  version?: string;
  dataVersion?: number;
  data?: Record<string, unknown>;
  filesIndex?: FilesIndex;
  createdAt?: string;
};




// --- utilities --------------------------------------------------------------
function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function readJSON<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}
function writeJSON(p: string, obj: any) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8');
}
function weakTag(v: number): string { return `W/"${v}"`; }
function nowIso() { return new Date().toISOString(); }
function shortId() { return Math.random().toString(36).slice(2, 8); }
function tsId() { return nowIso().replace(/[:.]/g, '-').replace('Z','Z') + '-' + shortId(); }

// Initialize data root
function initDataRoot() {
  ensureDir(DATA_ROOT);
  // buildings registry
  const regPath = path.join(DATA_ROOT, 'buildings.json');
  if (!fs.existsSync(regPath)) writeJSON(regPath, []);
  // templates/active.json copied from template.example.json if missing
  const tplDir = path.join(DATA_ROOT, 'templates');
  ensureDir(tplDir);
  const activePath = path.join(tplDir, 'active.json');
  if (!fs.existsSync(activePath)) {
    const tries = [
      path.resolve(process.cwd(), '../template.example.json'),
      path.resolve(process.cwd(), '../../template.example.json'),
      path.resolve(process.cwd(), '../../../template.example.json'),
    ];
    for (const p of tries) {
      if (fs.existsSync(p)) {
        fs.copyFileSync(p, activePath);
        break;
      }
    }
    if (!fs.existsSync(activePath)) writeJSON(activePath, { version: 'dev', sections: [] });
  }
}
initDataRoot();

// ==== PATCH: foundation resolution helpers =======================
function slugify(x: string) {
  return (x || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function foundationFolderFor(meta: BuildingMeta): string {
  return (
    meta?.foundationId ||
    (meta as any)?.foundationSlug ||
    (meta?.foundationName ? slugify(meta.foundationName) : "") ||
    "f_default"
  );
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
  } catch (e) {
    console.warn('[foundation-scan]', e);
  }
  return null;
}
// ==== END PATCH ==================================================



type BuildingMeta = { id: string; name?: string; foundationId?: string; foundationName?: string };
function getBuildings(): BuildingMeta[] {
  return readJSON(path.join(DATA_ROOT, 'buildings.json'), [] as BuildingMeta[]);
}
function getBuildingMeta(id: string): BuildingMeta | null {
  const all = getBuildings();
  const found = all.find(b => b.id === id);
  return found || null;
}
function getBuildingDir(meta: BuildingMeta) {
  const existing = locateExistingFoundationFolder(meta.id);
  const foundationFolder = existing || foundationFolderFor(meta);
  if (!existing && foundationFolder === 'f_default') {
    console.warn('[WARN] Using f_default for building', meta?.id, '(no foundation info found)');
  }
  return path.join(DATA_ROOT, 'orgs', CLIENT_ID, 'foundations', foundationFolder, 'buildings', meta.id);
}
function getCurrentJsonPath(meta: BuildingMeta) {
  return path.join(getBuildingDir(meta), 'current.json');
}
function getFilesDir(meta: BuildingMeta) {
  return path.join(getBuildingDir(meta), 'files');
}
function getVersionsDir(meta: BuildingMeta) {
  return path.join(getBuildingDir(meta), 'versions');
}
function getLogsDir(meta: BuildingMeta) { return path.join(getBuildingDir(meta), 'logs'); }
function getEventsLog(meta: BuildingMeta) { return path.join(getLogsDir(meta), 'events.log'); }

function logEvent(meta: BuildingMeta, evt: string, dataVersion: number, extra: any = {}) {
  ensureDir(getLogsDir(meta));
  const line = JSON.stringify({ ts: nowIso(), evt, dataVersion, by: 'system', meta: extra });
  fs.appendFileSync(getEventsLog(meta), line + '\n', 'utf-8');
}

// Load active template
function getActiveTemplate() {
  const p = path.join(DATA_ROOT, 'templates', 'active.json');
  const tpl = readJSON(p, {});
  return tpl;
}

// Ensure current.json exists for building
function ensureCurrent(meta: BuildingMeta) {
  const curPath = getCurrentJsonPath(meta);
  if (!fs.existsSync(curPath)) {
    const tpl = getActiveTemplate() as { version?: string };
    const init = {
      buildingId: meta.id,
      templateVersion: tpl.version || 'dev',
      dataVersion: 1,
      data: {} as Data,
      filesIndex: {} as Record<string, any>,
    };
    writeJSON(curPath, init);
    // also snapshot initial
    const vdir = path.join(getVersionsDir(meta), tsId());
    writeJSON(path.join(vdir, 'snapshot.json'), init);
    writeJSON(path.join(vdir, 'meta.json'), { versionId: path.basename(vdir), createdAt: nowIso(), dataVersion: init.dataVersion, by: 'system', reason: 'init' });
    logEvent(meta, 'init', 1);
  }
}

// --- Phase 0 ---------------------------------------------------------------
app.post('/auth/login', (_req, res) => {
  res.json({ token: 'demo-token', user: { id: 'u_demo', name: 'Demo User' } });
});

app.get('/templates/active', (_req, res) => {
  res.json({ version: (getActiveTemplate() as any).version || 'dev', template: getActiveTemplate() });
});

// --- New: list buildings ---------------------------------------------------
app.get('/buildings', (_req, res) => {
  res.json(getBuildings());
});
app.get('/foundations', (_req, res) => {
  const all = getBuildings();
  const map = new Map();
  for (const b of all) {
    const fid = b.foundationId || 'f_default';
    const fname = b.foundationName || 'Default';
    if (!map.has(fid)) map.set(fid, { id: fid, name: fname });
  }
  res.json(Array.from(map.values()));
});

// --- Form load -------------------------------------------------------------
app.get('/buildings/:id/form', (req, res) => {
  const id = req.params.id;
  const meta = getBuildingMeta(id) || { id, name: `Bâtiment ${id}`, foundationId: 'f_default', foundationName: 'Default' };
  ensureCurrent(meta);
  const cur: Data = readJSON<Data>(getCurrentJsonPath(meta), {} as Data);
  const etag = weakTag(cur.dataVersion || 1);
  res.setHeader('ETag', etag);
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  const building = { id: meta.id, name: meta.name || `Bâtiment ${id}`, fondation: { id: meta.foundationId || 'f_default', name: meta.foundationName || 'Default' } };
  res.json({
    building,
    templateVersion: cur.templateVersion || ((getActiveTemplate() as any).version || 'dev'),
    template: getActiveTemplate(),
    dataVersion: cur.dataVersion || 1,
    data: cur.data || {},
  });
});

// --- Review (for ETag & committed snapshot) --------------------------------
app.get('/buildings/:id/review', (req, res) => {
  const id = req.params.id;
  const meta = getBuildingMeta(id) || { id, foundationId: 'f_default' };
  ensureCurrent(meta);
  const cur: Data = readJSON<Data>(getCurrentJsonPath(meta), {} as Data);
  const etag = weakTag(cur.dataVersion || 1);
  res.setHeader('ETag', etag);
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  res.json({
    since: Number(req.query.since || cur.dataVersion || 1),
    dataVersion: cur.dataVersion || 1,
    added: [], removed: [], changed: [], // diff is handled client-side
    committed: cur.data || {},
    current: cur.data || {},
  });
});

// --- Save (every save bumps version + snapshot) ----------------------------
app.post('/buildings/:id/save', (req, res) => {
  const id = req.params.id;
  const meta = getBuildingMeta(id) || { id, foundationId: 'f_default' };
  ensureCurrent(meta);
  const body = req.body || {};
  const data = body.data || {};
  const reason = body.reason || 'save';
  const curPath = getCurrentJsonPath(meta);
  const cur: Data = readJSON<Data>(curPath, {} as Data);
  const tpl = getActiveTemplate() as { version?: string };
  const next = {
    buildingId: id,
    templateVersion: cur.templateVersion || tpl.version || 'dev',
    dataVersion: (cur.dataVersion || 1) + 1,
    data,
    filesIndex: cur.filesIndex || {},
  };
  writeJSON(curPath, next);
  const vpath = path.join(getVersionsDir(meta), tsId());
  writeJSON(path.join(vpath, 'snapshot.json'), next);
  writeJSON(path.join(vpath, 'meta.json'), { versionId: path.basename(vpath), createdAt: nowIso(), dataVersion: next.dataVersion, by: 'system', reason });
  logEvent(meta, 'save', next.dataVersion, { reason });
  const etag = weakTag(next.dataVersion);
  res.setHeader('ETag', etag);
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  res.json({ ok: true, dataVersion: next.dataVersion });
});

// --- Publish (If-Match) ----------------------------------------------------
app.post('/buildings/:id/publish', (req, res) => {
  const id = req.params.id;
  const meta = getBuildingMeta(id) || { id, foundationId: 'f_default' };
  ensureCurrent(meta);
  const ifMatch = req.header('If-Match');
  const cur: Data = readJSON<Data>(getCurrentJsonPath(meta), {} as Data);
  const expected = weakTag(cur.dataVersion || 1);
  if (!ifMatch || ifMatch !== expected) {
    res.status(412).json({ error: 'Precondition Failed', current: { dataVersion: cur.dataVersion || 1 } });
    return;
  }
  const body = req.body || {};
  const data = body.data || {};
  const reason = body.reason || 'publish';
  const next = {
    buildingId: id,
    templateVersion: cur.templateVersion || ((getActiveTemplate() as any).version || 'dev'),
    dataVersion: (cur.dataVersion || 1) + 1,
    data,
    filesIndex: cur.filesIndex || {},
  };
  writeJSON(getCurrentJsonPath(meta), next);
  const vpath = path.join(getVersionsDir(meta), tsId());
  writeJSON(path.join(vpath, 'snapshot.json'), next);
  writeJSON(path.join(vpath, 'meta.json'), { versionId: path.basename(vpath), createdAt: nowIso(), dataVersion: next.dataVersion, by: 'system', reason });
  logEvent(meta, 'publish', next.dataVersion, { reason });
  const etag = weakTag(next.dataVersion);
  res.setHeader('ETag', etag);
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  res.json({ ok: true, dataVersion: next.dataVersion });
});

// --- Versions --------------------------------------------------------------
app.get('/buildings/:id/versions', (req, res) => {
  const id = req.params.id;
  const meta = getBuildingMeta(id) || { id, foundationId: 'f_default' };
  ensureCurrent(meta);
  const vdir = getVersionsDir(meta);
  ensureDir(vdir);
  const list = fs.readdirSync(vdir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const metaP = path.join(vdir, d.name, 'meta.json');
      const m: any = readJSON(metaP, {});
      return { versionId: d.name, createdAt: m.createdAt || d.name, dataVersion: m.dataVersion || 0 } as VersionListItem;
    })
    .sort((a,b) => a.createdAt < b.createdAt ? 1 : -1);
  res.json(list);
});

app.get('/buildings/:id/versions/:versionId', (req, res) => {
  const id = req.params.id;
  const versionId = req.params.versionId;
  const meta = getBuildingMeta(id) || { id, foundationId: 'f_default' };
  const snap: any = readJSON(path.join(getVersionsDir(meta), versionId, 'snapshot.json'), null);
  if (!snap) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(snap);
});

app.post('/buildings/:id/restore', (req, res) => {
  const id = req.params.id;
  const { versionId } = req.body || {};
  if (!versionId) { res.status(400).json({ error: 'versionId required' }); return; }
  const meta = getBuildingMeta(id) || { id, foundationId: 'f_default' };
  ensureCurrent(meta);
  const curPath = getCurrentJsonPath(meta);
  const cur: any = readJSON(curPath, {});
  const snap: any = readJSON(path.join(getVersionsDir(meta), versionId, 'snapshot.json'), null);
  if (!snap) { res.status(404).json({ error: 'snapshot not found' }); return; }
  const restored = {
    buildingId: id,
    templateVersion: snap.templateVersion || cur.templateVersion || ((getActiveTemplate() as any).version || 'dev'),
    dataVersion: (cur.dataVersion || 1) + 1,
    data: snap.data || {},
    filesIndex: snap.filesIndex || cur.filesIndex || {},
  };
  writeJSON(curPath, restored);
  const vpath = path.join(getVersionsDir(meta), tsId());
  writeJSON(path.join(vpath, 'snapshot.json'), restored);
  writeJSON(path.join(vpath, 'meta.json'), { versionId: path.basename(vpath), createdAt: nowIso(), dataVersion: restored.dataVersion, by: 'system', reason: 'restore' });
  logEvent(meta, 'restore', restored.dataVersion, { versionId });
  const etag = weakTag(restored.dataVersion);
  res.setHeader('ETag', etag);
  res.setHeader('Access-Control-Expose-Headers', 'ETag');
  res.json({ ok: true, dataVersion: restored.dataVersion });
});

// --- Uploads ---------------------------------------------------------------
const upload = multer({ dest: path.join(DATA_ROOT, '.tmp') });
app.post('/buildings/:id/upload', upload.single('file'), (req, res) => {
  const id = req.params.id;
  const meta = getBuildingMeta(id) || { id, foundationId: 'f_default' };
  ensureCurrent(meta);
  const fieldPath = (req.body?.fieldPath || '').toString();
  if (!fieldPath || !req.file) {
    res.status(400).json({ error: 'file and fieldPath required' });
    return;
  }
  const filesDir = getFilesDir(meta);
  ensureDir(filesDir);
  const orig = req.file.originalname || 'upload.bin';
  const storedName = `${Date.now().toString(36)}_${orig.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  const destPath = path.join(filesDir, storedName);
  fs.renameSync(req.file.path, destPath);
  const info = {
    fileId: storedName.split('_')[0],
    originalName: orig,
    storedName,
    size: req.file.size,
    mime: req.file.mimetype,
    uploadedAt: nowIso(),
  };
  // update filesIndex in current
  const curPath = getCurrentJsonPath(meta);
  const cur: any = readJSON(curPath, {});
  const fi = cur.filesIndex || {};
  const prev = Array.isArray(fi[fieldPath]) ? fi[fieldPath] : [];
        if (prev.length && prev[0]?.storedName) {
          try {
            const oldPath = path.join(getFilesDir(meta), prev[0].storedName);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          } catch {}
        }
        fi[fieldPath] = [info];
  cur.filesIndex = fi;
  writeJSON(curPath, cur);
  logEvent(meta, 'upload', cur.dataVersion || 1, { fieldPath, storedName });
  res.json({ ok: true, file: info });
});

app.get('/buildings/:id/files/:storedName', (req, res) => {
  const id = req.params.id;
  const storedName = req.params.storedName;
  const meta = getBuildingMeta(id) || { id, foundationId: 'f_default' };
  const filePath = path.join(getFilesDir(meta), storedName);
  if (!fs.existsSync(filePath)) { res.status(404).end(); return; }
  res.sendFile(filePath);
});

// --- Static (optional) -----------------------------------------------------
app.get('/',       (_req, res) => res.redirect('/portal/index.html'));
app.get('/portal', (_req, res) => res.redirect('/portal/index.html'));
app.get('/form',   (_req, res) => res.redirect('/form/app.html')); // optionnel

app.get('/__health', (_req, res) => {
  res.json({ DATA_ROOT, cwd: process.cwd(), time: new Date().toISOString() });
});

// Static files (disable directory slash redirect for /portal)
app.use('/portal', express.static(
  path.resolve(process.cwd(), '../web/portal'),
  { redirect: false }
));
app.use('/form',   express.static(path.resolve(process.cwd(), '../web/form')));


// --- Start -----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} (DATA_ROOT=${DATA_ROOT})`);
});
