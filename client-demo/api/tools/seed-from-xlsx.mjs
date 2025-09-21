// Seed buildings.json from an XLSX file (supports French headers)
// Usage: DATA_ROOT=./data node tools/seed-from-xlsx.mjs <xlsx path>
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const DATA_ROOT = process.env.DATA_ROOT || path.resolve(process.cwd(), './data');
const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/seed-from-xlsx.mjs <xlsx path>');
  process.exit(1);
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/(^-|-$)/g,'')
    .slice(0, 40) || 'id';
}

const wb = xlsx.readFile(file);
const sheetName = wb.SheetNames[0];
const sh = wb.Sheets[sheetName];
const rows = xlsx.utils.sheet_to_json(sh, { defval: '' });

const out = [];
const seen = new Set();
const perSlugCount = new Map();

for (const r of rows) {
  const foundationName = (r['Support juridique'] || r['Fondation'] || r['foundationName'] || r['FoundationName'] || '').toString().trim();
  const buildingName = (r['Dénomination du bâtiment'] || r['Bâtiment'] || r['buildingName'] || r['BuildingName'] || '').toString().trim();
  if (!buildingName) continue;

  const foundationId = slugify(foundationName || 'f_default');
  let buildingIdBase = slugify(buildingName);
  if (!buildingIdBase) buildingIdBase = 'batiment';

  // disambiguate duplicates across entire registry
  let bid = buildingIdBase;
  let idx = perSlugCount.get(bid) || 0;
  while (seen.has(bid)) {
    idx += 1;
    bid = `${buildingIdBase}-${idx}`;
  }
  perSlugCount.set(buildingIdBase, idx);
  seen.add(bid);

  out.push({
    id: bid,
    name: buildingName,
    foundationId: foundationId || 'f_default',
    foundationName: foundationName || 'Fondation'
  });
}

const regPath = path.join(DATA_ROOT, 'buildings.json');
fs.mkdirSync(path.dirname(regPath), { recursive: true });
fs.writeFileSync(regPath, JSON.stringify(out, null, 2), 'utf-8');
console.log('Sheet:', sheetName, '| Wrote', regPath, 'with', out.length, 'buildings.');
