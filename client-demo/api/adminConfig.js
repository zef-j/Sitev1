/**
 * Admin Editor Config & DataRoot resolution
 * - DATA_ROOT is determined in this order:
 *   1) process.env.DATA_ROOT
 *   2) contents of "client-demo/api/data" (pointer file containing an absolute path)
 *   3) contents of top-level "_data" (pointer file), resolved relative to repo root
 *   4) fallback to "./data" next to this file (for local dev)
 */
const fs = require('fs');
const path = require('path');

function readPointerFile(p) {
  try {
    const s = fs.readFileSync(p, 'utf8').trim();
    if (s) return s;
  } catch {}
  return null;
}

function resolveDataRoot() {
  if (process.env.DATA_ROOT) return process.env.DATA_ROOT;
  // pointer next to this file (in your project this file exists and contains /srv/customer/.../data)
  const pointer1 = path.join(__dirname, 'data');
  const p1 = readPointerFile(pointer1);
  if (p1) return p1;
  // pointer at repo root (../../_data relative to this file)
  const pointer2 = path.join(__dirname, '../../_data');
  const p2 = readPointerFile(pointer2);
  if (p2) return p2;
  // local fallback
  return path.join(__dirname, 'data');
}

const DATA_ROOT = resolveDataRoot();
const REGISTRY_FILE = path.join(DATA_ROOT, 'buildings.json');

const ADMIN_DIR   = path.join(DATA_ROOT, '_admin');
const BACKUP_DIR  = path.join(DATA_ROOT, '_backups', 'registry');
const DATA_BKP_DIR= path.join(DATA_ROOT, '_backups', 'data');
const LOCK_DIR    = path.join(DATA_ROOT, '_locks');
const SECRET_FILE = path.join(ADMIN_DIR, 'secret.txt');
const AUDIT_LOG   = path.join(ADMIN_DIR, 'audit.log');

module.exports = {
  DATA_ROOT,
  REGISTRY_FILE,
  ADMIN_DIR,
  BACKUP_DIR,
  DATA_BKP_DIR,
  LOCK_DIR,
  SECRET_FILE,
  AUDIT_LOG,
};
