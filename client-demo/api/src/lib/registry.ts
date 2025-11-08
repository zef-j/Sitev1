
// client-demo/api/src/lib/registry.ts
import fs from 'fs';
import path from 'path';
import { ensureDir, readJSON, writeJSONAtomic, backupFile } from './fsx.js';
import { getConfig } from './config.js';

export interface BuildingEntry {
  id: string;
  name: string;
  foundationId: string;
  foundationName: string;
  aliases?: string[];
  [k: string]: any;
}

export interface Registry {
  entries: BuildingEntry[];
  byId: Map<string, BuildingEntry>;
}

export function loadRegistry(): Registry {
  const { REGISTRY_FILE } = getConfig();
  const arr = readJSON<BuildingEntry[]>(REGISTRY_FILE, []);
  const byId = new Map(arr.map(b => [b.id, b]));
  return { entries: arr, byId };
}

export function saveRegistryAtomic(next: BuildingEntry[]) {
  const { REGISTRY_FILE, BACKUP_DIR } = getConfig();
  if (fs.existsSync(REGISTRY_FILE)) {
    backupFile(REGISTRY_FILE, BACKUP_DIR, 'buildings');
  }
  writeJSONAtomic(REGISTRY_FILE, next);
}

export function expectedBuildingDir(foundationId: string, buildingId: string) {
  const { DATA_ROOT } = getConfig();
  return path.join(DATA_ROOT, 'orgs', 'main', 'foundations', foundationId, 'buildings', buildingId);
}
