// client-demo/api/src/lib/registry.ts
import fs from 'fs';
import path from 'path';
import { readJSON, writeJSONAtomic, backupFile } from './fsx.js';
import { getConfig } from './config.js';
export function loadRegistry() {
    const { REGISTRY_FILE } = getConfig();
    const arr = readJSON(REGISTRY_FILE, []);
    const byId = new Map(arr.map(b => [b.id, b]));
    return { entries: arr, byId };
}
export function saveRegistryAtomic(next) {
    const { REGISTRY_FILE, BACKUP_DIR } = getConfig();
    if (fs.existsSync(REGISTRY_FILE)) {
        backupFile(REGISTRY_FILE, BACKUP_DIR, 'buildings');
    }
    writeJSONAtomic(REGISTRY_FILE, next);
}
export function expectedBuildingDir(foundationId, buildingId) {
    const { DATA_ROOT } = getConfig();
    return path.join(DATA_ROOT, 'orgs', 'main', 'foundations', foundationId, 'buildings', buildingId);
}
