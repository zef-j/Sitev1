
// excelExport.js - build an .xlsx from template + current.json using exceljs (ESM)
import ExcelJS from 'exceljs';
import { Buffer } from 'buffer';

const BLUE = '1F4E79';
const SUB_BG = 'E8F0FA';
const GRID = 'A6A6A6';
const HEAD_BG = 'DAECF8';
const MONTHS_FR = ["janvier","février","fevrier","mars","avril","mai","juin","juillet","août","aout","septembre","octobre","novembre","décembre","decembre"];
const MONTH_MAP = {"janvier":"Jan","février":"Fév","fevrier":"Fév","mars":"Mar","avril":"Avr","mai":"Mai","juin":"Jui","juillet":"Jul","août":"Aoû","aout":"Aoû","septembre":"Sep","octobre":"Oct","novembre":"Nov","décembre":"Déc","decembre":"Déc"};

function s(x){ return (x==null) ? "" : String(x).trim(); }
function deaccentLower(t){
  return s(t).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function slugSheet(name){
  let base = s(name).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 _-]+/g,'').trim();
  if (!base) base = 'Section';
  return base.slice(0,31);
}
function getByPath(root, dotted){
  let cur = root;
  for (const key of dotted.split('.')){
    if (cur && typeof cur === 'object' && key in cur) cur = cur[key];
    else return undefined;
  }
  return cur;
}
function monthKey(k){
  const kk = s(k).toLowerCase();
  const i = MONTHS_FR.indexOf(kk);
  return i === -1 ? 999 : i;
}
function summarizeValue(ftype, value){
  if ((ftype==='yearTable' || ftype==='monthTable') && value && typeof value === 'object'){
    const nonNull = {};
    for (const [k,v] of Object.entries(value)){
      if (v!==null && v!=='' && !(Array.isArray(v) && v.length===0)) nonNull[k]=v;
    }
    const keys = Object.keys(nonNull).map(String).sort((a,b)=>{
      if (ftype==='monthTable') return monthKey(a) - monthKey(b);
      return (a<b?-1:a>b?1:0);
    });
    if (!keys.length) return '—';
    const head = keys.slice(0,8).join(', ') + (keys.length>8 ? ' …' : '');
    return `${keys.length} valeurs (${head})`;
  }
  if (ftype==='file'){
    if (value && typeof value==='object' && ('fileId' in value || 'name' in value || 'url' in value)) return '1 fichier';
    return '—';
  }
  if (value==null || value==='') return '—';
  const sv = String(value);
  return sv.length<=160 ? sv : (sv.slice(0,160) + '…');
}
function extractPairsFromSeries(ftype, value){
  const pairs = [];
  if (!value || typeof value!=='object') return pairs;
  if (ftype==='yearTable'){
    const tmp = [];
    for (const [k,v] of Object.entries(value)){
      const y = parseInt(String(k),10);
      const vv = (v===null || v==='') ? null : Number(v);
      if (!Number.isNaN(y) && vv!=null && !Number.isNaN(vv)) tmp.push([y, vv]);
    }
    tmp.sort((a,b)=>a[0]-b[0]);
    return tmp;
  } else {
    const tmp = [];
    for (const [k,v] of Object.entries(value)){
      const kk = s(k).toLowerCase();
      if (MONTHS_FR.includes(kk)){
        const vv = (v===null || v==='') ? null : Number(v);
        if (vv!=null && !Number.isNaN(vv)) tmp.push([kk, vv]);
      }
    }
    tmp.sort((a,b)=> monthKey(a[0]) - monthKey(b[0]));
    return tmp.map(([kk,vv])=>[MONTH_MAP[kk] || kk, vv]);
  }
}

export async function buildExcelBuffer(templateJson, currentJson){
  const template = typeof templateJson === 'string' ? JSON.parse(templateJson) : templateJson;
  const current  = typeof currentJson  === 'string' ? JSON.parse(currentJson)  : currentJson;
  const dataRoot = (current && current.data) || {};

  const wb = new ExcelJS.Workbook();
  // we’ll use styles inline per cell

  const usedNames = new Set();

  for (const section of (template.sections || [])){
    const sec_id = section.id || '';
    const sec_title = section.title || sec_id || 'Section';
    let sheetName = slugSheet(sec_title);
    let base = sheetName, i = 2;
    while (usedNames.has(sheetName)){
      const suffix = `_${i++}`;
      sheetName = (base.slice(0, 31 - suffix.length) + suffix);
    }
    usedNames.add(sheetName);

    const ws = wb.addWorksheet(sheetName, {properties: {defaultRowHeight: 14}});
    ws.columns = [{width: 42}, {width: 70}];

    let r = 1;
    // Title
    ws.mergeCells(r,1,r,2);
    const t = ws.getCell(r,1);
    t.value = sec_title;
    t.font = {bold:true, size:14, color:{argb: BLUE}};
    t.alignment = {vertical:'middle', horizontal:'left'};
    r++;

    // Spacer with bottom border
    ws.mergeCells(r,1,r,2);
    const sp = ws.getCell(r,1);
    sp.border = {bottom:{style:'thin', color:{argb: GRID}}};
    r++;

    const seriesBlocks = []; // [sub_title, label, ftype, pairs]

    for (const subsection of (section.subsections || [])){
      const sub_id = subsection.id || '';
      const sub_title = subsection.title || sub_id || '';
      ws.mergeCells(r,1,r,2);
      const st = ws.getCell(r,1);
      st.value = sub_title;
      st.font = {bold:true, color:{argb: BLUE}};
      st.fill = {type:'pattern', pattern:'solid', fgColor:{argb: SUB_BG}};
      st.border = {top:{style:'medium', color:{argb: BLUE}}};
      st.alignment = {vertical:'middle', horizontal:'left'};
      r++;

      for (const field of (subsection.fields || [])){
        const f_id = field.id, f_type = field.type;
        if (!f_id || !f_type || f_type === 'subtitle') continue;
        const label = field.label || f_id;
        const full_path = [sec_id, sub_id, f_id].filter(Boolean).join('.');
        const val = getByPath(dataRoot, full_path);

        const cLabel = ws.getCell(r,1);
        cLabel.value = label;
        cLabel.font = {bold:true, size:10};
        cLabel.alignment = {vertical:'top', horizontal:'left', wrapText:true};
        cLabel.border = {top:{style:'thin',color:{argb:GRID}}, left:{style:'thin',color:{argb:GRID}}, right:{style:'thin',color:{argb:GRID}}, bottom:{style:'thin',color:{argb:GRID}}};

        const cVal = ws.getCell(r,2);
        cVal.value = summarizeValue(f_type, val);
        cVal.font = {size:10};
        cVal.alignment = {vertical:'top', horizontal:'left', wrapText:true};
        cVal.border = {top:{style:'thin',color:{argb:GRID}}, left:{style:'thin',color:{argb:GRID}}, right:{style:'thin',color:{argb:GRID}}, bottom:{style:'thin',color:{argb:GRID}}};
        r++;

        const sec_tag = (deaccentLower(sec_title) + ' ' + deaccentLower(sec_id));
        if (sec_tag.includes('energie') && val && typeof val==='object' && (f_type==='yearTable' || f_type==='monthTable')){
          const pairs = extractPairsFromSeries(f_type, val);
          if (pairs.length) seriesBlocks.push([sub_title, label, f_type, pairs]);
        }
      }
    }

    const sec_tag = (deaccentLower(sec_title) + ' ' + deaccentLower(sec_id));
    if (sec_tag.includes('energie') && seriesBlocks.length){
      r++;
      ws.mergeCells(r,1,r,2);
      const cap = ws.getCell(r,1);
      cap.value = "Détails des valeurs (Énergie)";
      cap.font = {bold:true, color:{argb: BLUE}};
      cap.alignment = {vertical:'middle', horizontal:'left'};
      r++;
      for (const [sub_title, label, ftype, pairs] of seriesBlocks){
        ws.mergeCells(r,1,r,2);
        const head = ws.getCell(r,1);
        head.value = `${sub_title} — ${label}`;
        head.font = {bold:true, color:{argb: BLUE}};
        head.fill = {type:'pattern', pattern:'solid', fgColor:{argb: SUB_BG}};
        head.border = {top:{style:'medium', color:{argb: BLUE}}};
        r++;

        const c1 = ws.getCell(r,1), c2 = ws.getCell(r,2);
        c1.value = (ftype === 'yearTable') ? 'Année' : 'Mois';
        c2.value = 'Valeur';
        for (const c of [c1,c2]){
          c.font = {bold:true};
          c.fill = {type:'pattern', pattern:'solid', fgColor:{argb: HEAD_BG}};
          c.border = {top:{style:'thin',color:{argb:GRID}}, left:{style:'thin',color:{argb:GRID}}, right:{style:'thin',color:{argb:GRID}}, bottom:{style:'thin',color:{argb:GRID}}};
          c.alignment = {vertical:'middle', horizontal:'left'};
        }
        r++;
        for (const [a,v] of pairs){
          const ra = ws.getCell(r,1), rv = ws.getCell(r,2);
          ra.value = a;
          rv.value = v;
          for (const c of [ra,rv]){
            c.alignment = {vertical:'top', horizontal:'left', wrapText:true};
            c.border = {top:{style:'thin',color:{argb:GRID}}, left:{style:'thin',color:{argb:GRID}}, right:{style:'thin',color:{argb:GRID}}, bottom:{style:'thin',color:{argb:GRID}}};
          }
          r++;
        }
        r++;
      }
    }

    ws.views = [{state:'frozen', xSplit:0, ySplit:2}];
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
