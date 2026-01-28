// client-demo/api/src/lib/config.ts
import fs from 'fs';
import path from 'path';
function readFileIfExists(p) {
    try {
        return fs.readFileSync(p, 'utf8').trim();
    }
    catch {
        return null;
    }
}
export function resolveDataRoot() {
    // Prefer existing adminConfig if present
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cfg = require('../adminConfig.js');
        if (cfg?.DATA_ROOT && fs.existsSync(cfg.DATA_ROOT))
            return cfg.DATA_ROOT;
        if (cfg?.default?.DATA_ROOT && fs.existsSync(cfg.default.DATA_ROOT))
            return cfg.default.DATA_ROOT;
    }
    catch { }
    try {
        // when compiled to dist/, __dirname is .../dist/lib
        const env = process.env.DATA_ROOT;
        if (env && fs.existsSync(env))
            return env;
        // pointer file "data" containing an absolute path (legacy)
        const pointerCandidates = [
            path.resolve(__dirname, '../data'),
            path.resolve(__dirname, '../../data'),
            path.resolve(process.cwd(), 'data'),
        ];
        for (const p of pointerCandidates) {
            const s = readFileIfExists(p);
            if (s && fs.existsSync(s))
                return s;
        }
        // fallback to a sibling "data" directory if it exists
        const fallbackCandidates = [
            path.resolve(__dirname, '../../../data'),
            path.resolve(process.cwd(), '../../data'),
        ];
        for (const p of fallbackCandidates) {
            if (fs.existsSync(p))
                return p;
        }
    }
    catch { }
    // final fallback: current working directory /data
    return path.resolve(process.cwd(), 'data');
}
export function getConfig() {
    const DATA_ROOT = resolveDataRoot();
    return {
        DATA_ROOT,
        REGISTRY_FILE: path.join(DATA_ROOT, 'buildings.json'),
        LOCK_DIR: path.join(DATA_ROOT, '_locks'),
        BACKUP_DIR: path.join(DATA_ROOT, '_backups'),
    };
}
