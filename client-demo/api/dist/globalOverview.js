// client-demo/api/src/globalOverview.ts
import ExcelJS from 'exceljs';
function s(x) { return x == null ? '' : String(x); }
const MONTHS_FR_ORDER = ['janvier', 'février', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'aout', 'septembre', 'octobre', 'novembre', 'décembre', 'decembre'];
const MONTHS_FR_SHORT = {
    'janvier': 'Jan', 'février': 'Fév', 'fevrier': 'Fév', 'mars': 'Mar', 'avril': 'Avr', 'mai': 'Mai', 'juin': 'Juin',
    'juillet': 'Juil', 'août': 'Aoû', 'aout': 'Aoû', 'septembre': 'Sep', 'octobre': 'Oct', 'novembre': 'Nov', 'décembre': 'Déc', 'decembre': 'Déc'
};
function getByPath(root, dotted) {
    const parts = dotted.split('.');
    let cur = root;
    for (const k of parts) {
        if (cur && typeof cur === 'object' && k in cur)
            cur = cur[k];
        else
            return undefined;
    }
    return cur;
}
function monthOrderKey(k) {
    const i = MONTHS_FR_ORDER.indexOf(s(k).toLowerCase());
    return i === -1 ? 999 : i;
}
function summarizeValue(ftype, value) {
    // mirrors build_global_overview.py compact summaries
    if ((ftype === 'yearTable' || ftype === 'monthTable') && value && typeof value === 'object' && !Array.isArray(value)) {
        const keys = Object.keys(value || {}).filter(k => value[k] != null && value[k] !== '');
        if (!keys.length)
            return '—';
        keys.sort((a, b) => {
            if (ftype === 'monthTable')
                return monthOrderKey(a) - monthOrderKey(b);
            return a.localeCompare(b, undefined, { numeric: true });
        });
        const head = keys.slice(0, 8).map(k => ftype === 'monthTable' ? (MONTHS_FR_SHORT[s(k).toLowerCase()] || k) : k).join(', ');
        return `${keys.length} valeurs (${head}${keys.length > 8 ? ' …' : ''})`;
    }
    if (ftype === 'file') {
        if (value && typeof value === 'object' && (value.fileId || value.url || value.name || value.storedName))
            return '1 fichier';
        return '—';
    }
    if (value == null || value === '')
        return '—';
    const sv = s(value).trim();
    return sv.length <= 160 ? sv : (sv.slice(0, 160) + '…');
}
export async function buildGlobalOverviewBuffer(templateJson, items) {
    const template = typeof templateJson === 'string' ? JSON.parse(templateJson) : templateJson;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Global');
    // Static columns
    const staticCols = [
        { header: 'Section', key: 'section', width: 24 },
        { header: 'Sous-section', key: 'subsection', width: 28 },
        { header: 'Libellé', key: 'label', width: 36 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Path', key: 'path', width: 40 },
    ];
    const dynCols = items.map(it => ({ header: it.label, key: it.label, width: 28 }));
    ws.columns = [...staticCols, ...dynCols];
    // Header style
    for (let c = 1; c <= staticCols.length + dynCols.length; c++) {
        const cell = ws.getCell(1, c);
        cell.font = { bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
    }
    ws.getRow(1).height = 22;
    const rows = [];
    const sections = Array.isArray(template?.sections) ? template.sections : [];
    for (const sec of sections) {
        const secId = sec.id || '';
        const secTitle = sec.title || secId;
        const subs = Array.isArray(sec.subsections) ? sec.subsections : [];
        for (const sub of subs) {
            const subId = sub.id || '';
            const subTitle = sub.title || subId;
            const fields = Array.isArray(sub.fields) ? sub.fields : [];
            for (const f of fields) {
                const fId = f.id || '';
                const fType = f.type || '';
                if (!fId || !fType || fType === 'subtitle')
                    continue;
                const label = f.label || fId;
                const path = [secId, subId, fId].filter(Boolean).join('.');
                rows.push({ secTitle, subTitle, label, path, type: fType });
            }
        }
    }
    // Fill data rows
    let r = 2;
    for (const row of rows) {
        const base = [row.secTitle, row.subTitle, row.label, row.type, row.path];
        const vals = items.map(it => {
            const dataRoot = (it.current && (it.current.data || {})) || {};
            const v = getByPath(dataRoot, row.path);
            return summarizeValue(row.type, v);
        });
        ws.addRow([...base, ...vals]);
        // zebra
        if (r % 2 === 0) {
            const lastCol = 5 + dynCols.length;
            for (let c = 1; c <= lastCol; c++) {
                const cell = ws.getCell(r, c);
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
            }
        }
        r++;
    }
    // widths & view
    for (let i = 1; i <= 5; i++)
        ws.getColumn(i).width = staticCols[i - 1].width;
    for (let i = 6; i < 6 + dynCols.length; i++)
        ws.getColumn(i).width = 28;
    ws.getColumn(4).hidden = true; // Type
    ws.getColumn(5).hidden = true; // Path
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}
