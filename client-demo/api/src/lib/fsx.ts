
// client-demo/api/src/lib/fsx.ts
import fs from 'fs';
import path from 'path';

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}
export function pathExists(p: string): boolean {
  try { fs.accessSync(p); return true; } catch { return false; }
}

export function readJSON<T=any>(p: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
export function writeJSONAtomic(p: string, data: any) {
  const dir = path.dirname(p);
  ensureDir(dir);
  const tmp = path.join(dir, `.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, p);
}

export function backupFile(src: string, backupDir: string, tag: string) {
  try {
    ensureDir(backupDir);
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const dest = path.join(backupDir, `${tag}-${stamp}.json`);
    fs.copyFileSync(src, dest);
  } catch {}
}

export function withFileLock<T>(lockDir: string, key: string, fn: () => T): T {
  ensureDir(lockDir);
  const lockPath = path.join(lockDir, `${key}.lock`);
  const fd = fs.openSync(lockPath, 'wx'); // exclusive
  try {
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(lockPath); } catch {}
  }
}

export function moveDirWithMerge(src: string, dest: string) {
  ensureDir(path.dirname(dest));
  // If dest doesn't exist, try fast rename
  if (!pathExists(dest)) {
    try {
      fs.renameSync(src, dest);
      return { moved: true, merged: false };
    } catch { /* fallthrough to copy */ }
  }
  // Else copy into dest, preserving existing files
  const stack: Array<{from: string, to: string}> = [{from: src, to: dest}];
  while (stack.length) {
    const {from, to} = stack.pop()!;
    const st = fs.statSync(from);
    if (st.isDirectory()) {
      ensureDir(to);
      for (const e of fs.readdirSync(from)) {
        stack.push({from: path.join(from, e), to: path.join(to, e)});
      }
    } else {
      ensureDir(path.dirname(to));
      if (!pathExists(to)) fs.copyFileSync(from, to);
    }
  }
  // Remove src recursively
  const rm: string[] = [src];
  while (rm.length) {
    const cur = rm.pop()!;
    const st2 = fs.statSync(cur);
    if (st2.isDirectory()) {
      for (const e of fs.readdirSync(cur)) rm.push(path.join(cur, e));
      try { fs.rmdirSync(cur); } catch {}
    } else {
      try { fs.unlinkSync(cur); } catch {}
    }
  }
  return { moved: false, merged: true };
}
