
// client-demo/api/src/globalOverview.ts
import ExcelJS from 'exceljs';

function s(x: any): string { return (x==null) ? '' : String(x).trim(); }

const MONTHS_FR = ["janvier","février","fevrier","mars","avril","mai","juin","juillet","août","aout","septembre","octobre","novembre","décembre","decembre"];
const MONTH_MAP: Record<string,string> = {"janvier":"Jan","février":"Fév","fevrier":"Fév","mars":"Mar","avril":"Avr","mai":"Mai","juin":"Juin","juillet":"Juil","août":"Aoû","aout":"Aoû","septembre":"Sep","octobre":"Oct","novembre":"Nov","décembre":"Déc","decembre":"Déc"};

function getByPath(root: any, dotted: string){
  let cur = root;
  for (const key of dotted.split('.')){
    if (cur && typeof cur === 'object' && key in cur) cur = (cur as any)[key];
    else return undefined;
  }
  return cur;
}

function monthKey(k: string): number {
  const kk = s(k).toLowerCase();
  const i = MONTHS_FR.indexOf(kk);
  return i === -1 ? 999 : i;
}

function summarizeValue(ftype: string, value: any): string {
  // Compact summary for global view (mirror of build_global_overview.py)
  if ((ftype === 'yearTable' || ftype === 'monthTable') && value && typeof value === 'object' && !Array.isArray(value)) {
    const nonNull: Record<string, any> = {};
    for (const [k,v] of Object.entries(value as any)) {
      if (v !== null && v !== '' && !(Array.isArray(v) && (v as any[]).length === 0)) nonNull[String(k)] = v;
    }
    const keys = Object.keys(nonNull);
    if (!keys.length) return '—';
    keys.sort((a,b)=>{
      if (ftype === 'monthTable') return monthKey(a) - monthKey(b);
      const aa = String(a), bb = String(b);
      return aa.localeCompare(bb, undefined, { numeric: true });
    });
    const head = keys.slice(0,8).join(', ') + (keys.length>8 ? ' …' : '');
    return `${keys.length} valeurs (${head})`;
  }
  if (ftype === 'file') {
    if (value && typeof value === 'object' && ('fileId' in value || 'name' in value || 'url' in value)) return '1 fichier';
    return '—';
  }
  if (value == null || value === '') return '—';
  const sv = String(value);
  return sv.length <= 160 ? sv : (sv.slice(0,160) + '…');
}

function safeLabel(text: string): string {
  return (text || '').toString().replace(/[\r\n\t]+/g,' ').trim();
}

export async function buildGlobalOverviewBuffer(templateJson: any, items: Array<{label: string, current: any}>): Promise<Buffer> {
  const template = typeof templateJson === 'string' ? JSON.parse(templateJson) : templateJson;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Global');

  // Columns
  const baseCols = ['Section','Sous-section','Libellé','Type','Path'];
  const dynCols = items.map(it => safeLabel(it.label));
  ws.addRow([...baseCols, ...dynCols]);

  // Style header
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: '1F4E79' } };

  // Build template rows
  const rows: Array<{secTitle:string, subTitle:string, label:string, path:string, type:string}> = [];
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  for (const section of sections){
    const secId = section.id || '';
    const secTitle = section.title || secId || '';
    const subs = Array.isArray(section.subsections) ? section.subsections : [];
    for (const sub of subs){
      const subId = sub.id || '';
      const subTitle = sub.title || subId || '';
      const fields = Array.isArray(sub.fields) ? sub.fields : [];
      for (const f of fields){
        const fId = f.id;
        const fType = f.type;
        if (!fId || !fType || fType === 'subtitle') continue;
        const label = f.label || fId;
        const path = [secId, subId, fId].filter(Boolean).join('.');
        rows.push({ secTitle, subTitle, label, path, type: fType });
      }
    }
  }

  // Write data rows
  let r = 2;
  for (const row of rows){
    const base = [row.secTitle, row.subTitle, row.label, row.type, row.path];
    const vals = items.map(it => {
      const dataRoot = it.current && (it.current.data || {});
      const v = getByPath(dataRoot, row.path);
      return summarizeValue(row.type, v);
    });
    ws.addRow([...base, ...vals]);
    // zebra band
    if (r % 2 === 0) {
      const lastCol = 5 + dynCols.length;
      for (let c=1; c<=lastCol; c++) {
        const cell = ws.getCell(r, c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F7F7F7' } };
      }
    }
    r++;
  }

  // Column widths
  ws.columns[0].width = 22;
  ws.columns[1].width = 26;
  ws.columns[2].width = 40;
  ws.columns[3].width = 12;
  ws.columns[4].width = 44;
  for (let i=5; i<5+dynCols.length; i++) {
    ws.columns[i].width = 28;
  }

  // Hide Type & Path by default
  ws.getColumn(4).hidden = true;
  ws.getColumn(5).hidden = true;

  // Freeze: top row and first 3 columns
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
