// client-demo/api/src/admin/changeBuildingId.ts
import path from 'path';
import fs from 'fs';
import express from 'express';
import { getConfig } from '../lib/config.js';
import { loadRegistry, saveRegistryAtomic, expectedBuildingDir } from '../lib/registry.js';
import { withFileLock, moveDirWithMerge } from '../lib/fsx.js';
export const router = express.Router();
function pickId(body) {
    const b = body;
    const oldId = b.id || b.oldId || b.fromId;
    const newId = b.newId || b.toId || b.nextId;
    if (!oldId || !newId)
        throw Object.assign(new Error('id and newId required'), { status: 400 });
    return { oldId, newId };
}
function normalizeAliases(a) {
    if (!a || !Array.isArray(a))
        return undefined;
    const uniq = Array.from(new Set(a.filter(s => !!s && typeof s === 'string')));
    return uniq.length ? uniq : undefined;
}
async function updateCurrentJsonBuildingId(dir, newId) {
    const p = path.join(dir, 'current.json');
    try {
        const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (obj && obj.buildingId !== newId) {
            obj.buildingId = newId;
            fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
        }
    }
    catch { }
}
router.post('/change-building-id', express.json(), async (req, res) => {
    const { DATA_ROOT, LOCK_DIR } = getConfig();
    const { oldId, newId } = pickId(req.body);
    try {
        const result = withFileLock(LOCK_DIR, 'registry', () => {
            const reg = loadRegistry();
            const entry = reg.byId.get(oldId);
            if (!entry) {
                res.status(404);
                return { ok: false, error: `building id '${oldId}' not found in registry` };
            }
            if (reg.byId.has(newId)) {
                res.status(409);
                return { ok: false, error: `new id '${newId}' already exists in registry` };
            }
            if (oldId === newId) {
                return { ok: true, message: 'no-op (same id)' };
            }
            // 1) update registry entry
            const nextEntry = { ...entry };
            const aliases = normalizeAliases([...(nextEntry.aliases || []), oldId]);
            nextEntry.aliases = aliases;
            nextEntry.id = newId;
            // 2) compute dirs
            const srcDir = expectedBuildingDir(entry.foundationId, oldId);
            const dstDir = expectedBuildingDir(entry.foundationId, newId);
            // 3) move/merge on disk (canonicalize)
            const moveRes = moveDirWithMerge(srcDir, dstDir);
            // 4) patch current.json
            try {
                updateCurrentJsonBuildingId(dstDir, newId);
            }
            catch { }
            // 5) write new registry array atomically
            const nextArr = reg.entries.map(b => (b.id === oldId ? nextEntry : b));
            saveRegistryAtomic(nextArr);
            return {
                ok: true,
                oldId,
                newId,
                moved: moveRes.moved,
                merged: moveRes.merged,
                srcDir,
                dstDir,
                aliases: nextEntry.aliases || [],
            };
        });
        if (!result)
            return; // response already set
        if (!result.ok)
            return res.json(result);
        return res.json(result);
    }
    catch (err) {
        const status = err?.status || 500;
        return res.status(status).json({ ok: false, error: err?.message || String(err) });
    }
});
