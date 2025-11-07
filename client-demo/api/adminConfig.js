// ESM version of adminConfig.js
import fs from 'fs';
import path from 'path';

const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

function readPointerFile(p) {
  try {
    const s = fs.readFileSync(p, 'utf8').trim();
    if (s) return s;
  } catch {}
  return null;
}

function resolveDataRoot() {
  if (process.env.DATA_ROOT) return process.env.DATA_ROOT;
  const pointer1 = path.join(__dirname, 'data');
  const p1 = readPointerFile(pointer1);
  if (p1) return p1;
  const pointer2 = path.join(__dirname, '../../_data');
  const p2 = readPointerFile(pointer2);
  if (p2) return p2;
  return path.join(__dirname, 'data');
}

export const DATA_ROOT = resolveDataRoot();
export const REGISTRY_FILE = path.join(DATA_ROOT, 'buildings.json');

export const ADMIN_DIR   = path.join(DATA_ROOT, '_admin');
export const BACKUP_DIR  = path.join(DATA_ROOT, '_backups', 'registry');
export const DATA_BKP_DIR= path.join(DATA_ROOT, '_backups', 'data');
export const LOCK_DIR    = path.join(DATA_ROOT, '_locks');
export const SECRET_FILE = path.join(ADMIN_DIR, 'secret.txt');
export const AUDIT_LOG   = path.join(ADMIN_DIR, 'audit.log');

export const FOUNDATION_ALIASES_FILE = path.join(DATA_ROOT, 'foundation-aliases.json');

export default {
  DATA_ROOT, REGISTRY_FILE, ADMIN_DIR, BACKUP_DIR, DATA_BKP_DIR, LOCK_DIR, SECRET_FILE, AUDIT_LOG, FOUNDATION_ALIASES_FILE
};
