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

/** MTGCH archive files under the resolved `magic.data.mtgch` directory. */
export function listMtgchArchives(mtgchDir: string): DataFile[] {
  if (!existsSync(mtgchDir)) return [];
  return readdirSync(mtgchDir)
    .filter(f => f.startsWith('magic-cards-zhs-data-') && f.endsWith('.tar.gz'))
    .sort()
    .map(f => ({ name: f, path: join(mtgchDir, f) }));
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
