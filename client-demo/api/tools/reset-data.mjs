// Reset all per-building data (keeps buildings.json and templates)
import fs from 'fs';
import path from 'path';

const DATA_ROOT = process.env.DATA_ROOT || path.resolve(process.cwd(), './data');
const orgDir = path.join(DATA_ROOT, 'orgs');
if (!fs.existsSync(orgDir)) {
  console.log('Nothing to reset (no orgs/)');
  process.exit(0);
}
function rmrf(p) {
  if (!fs.existsSync(p)) return;
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) rmrf(path.join(p, e));
    fs.rmdirSync(p);
  } else {
    fs.unlinkSync(p);
  }
}
for (const client of fs.readdirSync(orgDir)) {
  const fdir = path.join(orgDir, client, 'foundations');
  if (fs.existsSync(fdir)) {
    for (const f of fs.readdirSync(fdir)) {
      const bdir = path.join(fdir, f, 'buildings');
      if (fs.existsSync(bdir)) rmrf(bdir);
    }
  }
}
console.log('Reset complete.');
