import { orpc } from '~/lib/orpc';

/** One discovered Magic data file. */
export interface MagicDataFile {
  name: string;
  path: string;
}

/** Discovered Magic data directory contents returned by the desktop runtime. */
export interface MagicDataState {
  dataDir:  string | null;
  scryfall: MagicDataFile[];
  mtgch:    { dir: string | null, files: MagicDataFile[] };
  mtgjson:  { dir: string | null, fileCount: number };
}

/** Reads the Magic data directory state (discovered source files) from the desktop runtime. */
export function getMagicDataState() {
  return orpc.magic.getDataState() as Promise<MagicDataState>;
}
