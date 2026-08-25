import { db } from '@tcg-cards/db/db';
import { MtgjsonSet } from '@tcg-cards/db/schema/local/magic';

const CACHE_MS = 30 * 24 * 3600 * 1000;

/** Minimal view of the MTGJSON Set object fields stored as columns. */
interface MtgjsonSetData {
  code:              string;
  name:              string;
  type:              string;
  baseSetSize:       number;
  totalSetSize:      number;
  releaseDate:       string;
  isFoilOnly:        boolean;
  isNonFoilOnly?:    boolean;
  isOnlineOnly:      boolean;
  isPaperOnly?:      boolean;
  isForeignOnly?:    boolean;
  isPartialPreview?: boolean;
  keyruneCode:       string;
  block?:            string;
  parentCode?:       string;
  mtgoCode?:         string;
  mcmId?:            number;
  mcmIdExtras?:      number;
  mcmName?:          string;
  cardsphereSetId?:  number;
  tcgplayerGroupId?: number;
  tokenSetCode?:     string;
  languages?:        string[];
  translations?:     Record<string, string>;
}

/** MTGJSON set file shape: `{ meta, data: Set }`. */
interface MtgjsonSetFile {
  meta: unknown;
  data: MtgjsonSetData & Record<string, unknown>;
}

/** Imports one MTGJSON set file into magic_data.mtgjson_sets. Returns rows inserted. */
export async function importMtgjsonSetFile(file: string): Promise<number> {
  const parsed = await Bun.file(file).json() as MtgjsonSetFile;
  const set = parsed.data;

  const row: typeof MtgjsonSet.$inferInsert = {
    setId:            set.code,
    name:             set.name,
    type:             set.type,
    baseSetSize:      set.baseSetSize,
    totalSetSize:     set.totalSetSize,
    releaseDate:      set.releaseDate,
    isFoilOnly:       set.isFoilOnly,
    isNonFoilOnly:    set.isNonFoilOnly ?? null,
    isOnlineOnly:     set.isOnlineOnly,
    isPaperOnly:      set.isPaperOnly ?? null,
    isForeignOnly:    set.isForeignOnly ?? null,
    isPartialPreview: set.isPartialPreview ?? null,
    keyruneCode:      set.keyruneCode,
    block:            set.block ?? null,
    parentCode:       set.parentCode ?? null,
    mtgoCode:         set.mtgoCode ?? null,
    mcmId:            set.mcmId ?? null,
    mcmIdExtras:      set.mcmIdExtras ?? null,
    mcmName:          set.mcmName ?? null,
    cardsphereSetId:  set.cardsphereSetId ?? null,
    tcgplayerGroupId: set.tcgplayerGroupId ?? null,
    tokenSetCode:     set.tokenSetCode ?? null,
    languages:        set.languages ?? null,
    translations:     set.translations ?? null,
    data:             set as unknown,
    expiresAt:        new Date(Date.now() + CACHE_MS),
  };

  const { setId: _setId, ...updateSet } = row;
  await db.insert(MtgjsonSet).values(row as never).onConflictDoUpdate({
    target: [MtgjsonSet.setId],
    set:    updateSet as any,
  });
  return 1;
}
