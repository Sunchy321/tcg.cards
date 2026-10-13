import { readdirSync } from 'node:fs';

import { db } from '@tcg-cards/db/db';
import { MtgjsonSet } from '@tcg-cards/db/schema/local/magic';

import { softDeleteMissing, upsertBatch, type ImportCounts } from '../upsert';

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

/** Imports one MTGJSON set file into magic_data.mtgjson_sets. Returns the import report. */
export async function importMtgjsonSetFile(file: string): Promise<ImportCounts> {
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
  };

  const counts = await upsertBatch(db, MtgjsonSet, [row], MtgjsonSet.setId, ['setId']);
  return { ...counts, deleted: 0 };
}

/** Soft-deletes cached sets whose code is not present among the dir's set files. */
export async function finalizeMtgjsonSets(dir: string): Promise<number> {
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const imported = new Set(files.map(f => f.replace(/\.json$/, '')));
  return softDeleteMissing(db, MtgjsonSet, [MtgjsonSet.setId], ['setId'], imported);
}
