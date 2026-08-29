import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface DataFile {
  name: string;
  path: string;
}

/** Scryfall bulk files inside the resolved `magic.data.scryfall` directory. */
export function listScryfallFiles(scryfallDir: string): DataFile[] {
  if (!existsSync(scryfallDir)) return [];
  return readdirSync(scryfallDir)
    .filter(f => f.endsWith('.jsonl.gz') || f.endsWith('.jsonl'))
    .sort()
    .map(f => ({ name: f, path: join(scryfallDir, f) }));
}

/** Most recent MTGCH export directory under the resolved `magic.data.mtgch` directory. */
function latestMtgchDir(mtgchDir: string): string | null {
  if (!existsSync(mtgchDir)) return null;
  const dirs = readdirSync(mtgchDir).filter(f => f.startsWith('magic-cards-zhs-data-')).sort();
  return dirs.length > 0 ? join(mtgchDir, dirs[dirs.length - 1]!) : null;
}

/** MTGCH zhs_*.json files under the latest export directory. */
export function listMtgchFiles(mtgchDir: string): { dir: string | null, files: DataFile[] } {
  const dir = latestMtgchDir(mtgchDir);
  if (dir == null || !existsSync(dir)) return { dir: null, files: [] };
  return {
    dir,
    files: readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f, path: join(dir, f) })),
  };
}

/** MTGJSON per-set directory `<mtgjsonDir>/set` and its file count. */
export function listMtgjsonFiles(mtgjsonDir: string): { dir: string | null, fileCount: number } {
  const dir = join(mtgjsonDir, 'set');
  if (!existsSync(dir)) return { dir: null, fileCount: 0 };
  return {
    dir,
    fileCount: readdirSync(dir).filter(f => f.endsWith('.json')).length,
  };
}
