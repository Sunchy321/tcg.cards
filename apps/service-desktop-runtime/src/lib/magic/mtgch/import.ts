import { db } from '@tcg-cards/db/db';
import {
  MtgchZhsCard,
  MtgchZhsFlavor,
  MtgchZhsOracle,
  MtgchZhsRuling,
  MtgchZhsSet,
  MtgchZhsType,
} from '@tcg-cards/db/schema/local/magic';

import { pickSnake } from '../jsonl';
import { readTarGzJsonl } from '../tar-gz';
import { softDeleteMissing, upsertBatch, type ImportCounts } from '../upsert';

const BATCH = 1000;

const cardMap = {
  cardId:       'card_id',
  name:         'name',
  faceName:     'face_name',
  flavorName:   'flavor_name',
  typeLine:     'type_line',
  text:         'text',
  flavorText:   'flavor_text',
  multiverseId: 'multiverse_id',
  source:       'source',
} as const;

const oracleMap = {
  faceOracleId:    'face_oracle_id',
  oracleId:        'oracle_id',
  name:            'name',
  set:             'set',
  collectorNumber: 'collector_number',
  releasedAt:      'released_at',
  typeLine:        'type_line',
  oracleText:      'oracle_text',
  translatedName:  'translated_name',
  nameStage:       'name_stage',
  nameSource:      'name_source',
  translatedType:  'translated_type',
  typeStage:       'type_stage',
  translatedText:  'translated_text',
  textStage:       'text_stage',
  textSource:      'text_source',
  formerNames:     'former_names',
} as const;

const flavorMap = {
  flavorId:             'flavor_id',
  name:                 'name',
  flavorName:           'flavor_name',
  flavorText:           'flavor_text',
  set:                  'set',
  collectorNumber:      'collector_number',
  releasedAt:           'released_at',
  translatedFlavorName: 'translated_flavor_name',
  translatedFlavorText: 'translated_flavor_text',
  flavorUpdatedAt:      'flavor_updated_at',
  source:               'source',
  stage:                'stage',
} as const;

const rulingMap = {
  ruling:          'ruling',
  comment:         'comment',
  translation:     'translation',
  source:          'source',
  stage:           'stage',
  lastPublishedAt: 'last_published_at',
} as const;

const setMap = {
  setId:  'set_id',
  code:   'code',
  name:   'name',
  source: 'source',
  stage:  'stage',
} as const;

const typeMap = {
  typeName:    'type_name',
  typeType:    'type_type',
  translation: 'translation',
  stage:       'stage',
} as const;

/** Builds a zhs row from a snake_case file object, adding extra + expiry. */
function zhsRow<T>(obj: Record<string, unknown>, map: Record<string, string>): T {
  return { ...pickSnake(obj, map as never), extra: obj.extra ?? null } as unknown as T;
}

/** Upserts parsed zhs objects in batches, then soft-deletes rows dropped by the source. */
async function importObjects<T>(
  objects: AsyncIterable<Record<string, unknown>>,
  map: Record<string, string>,
  table: any,
  target: any,
  pkNames: string[],
  pkColumns: any[],
  onProgress?: (done: number) => void,
): Promise<ImportCounts> {
  const importedKeys = new Set<string>();
  const keyOf = (row: Record<string, unknown>) => pkNames.map(name => String(row[name])).join('|');
  const counts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };
  let processed = 0;
  let batch: T[] = [];
  for await (const obj of objects) {
    const row = zhsRow<T>(obj, map);
    batch.push(row);
    importedKeys.add(keyOf(row as unknown as Record<string, unknown>));
    if (batch.length >= BATCH) {
      const result = await upsertBatch(db, table, batch, target, pkNames);
      counts.inserted += result.inserted;
      counts.updated += result.updated;
      counts.unchanged += result.unchanged;
      processed += batch.length;
      onProgress?.(processed);
      batch = [];
    }
  }
  if (batch.length) {
    const result = await upsertBatch(db, table, batch, target, pkNames);
    counts.inserted += result.inserted;
    counts.updated += result.updated;
    counts.unchanged += result.unchanged;
    processed += batch.length;
    onProgress?.(processed);
  }
  counts.deleted = await softDeleteMissing(db, table, pkColumns, pkNames, importedKeys);
  return counts;
}

/** Imports the zhs_card.json entry from an MTGCH archive. Returns the import report. */
export function importMtgchCard(archive: string, onProgress?: (done: number) => void): Promise<ImportCounts> {
  return importObjects(readTarGzJsonl(archive, 'zhs_card.json'), cardMap, MtgchZhsCard, MtgchZhsCard.cardId, ['cardId'], [MtgchZhsCard.cardId], onProgress);
}

/** Imports the zhs_oracle.json entry from an MTGCH archive. Returns the import report. */
export function importMtgchOracle(archive: string, onProgress?: (done: number) => void): Promise<ImportCounts> {
  return importObjects(readTarGzJsonl(archive, 'zhs_oracle.json'), oracleMap, MtgchZhsOracle, MtgchZhsOracle.faceOracleId, ['faceOracleId'], [MtgchZhsOracle.faceOracleId], onProgress);
}

/** Imports the zhs_flavor.json entry from an MTGCH archive. Returns the import report. */
export function importMtgchFlavor(archive: string, onProgress?: (done: number) => void): Promise<ImportCounts> {
  return importObjects(readTarGzJsonl(archive, 'zhs_flavor.json'), flavorMap, MtgchZhsFlavor, MtgchZhsFlavor.flavorId, ['flavorId'], [MtgchZhsFlavor.flavorId], onProgress);
}

/** Imports the zhs_ruling.json entry from an MTGCH archive. Returns the import report. */
export function importMtgchRuling(archive: string, onProgress?: (done: number) => void): Promise<ImportCounts> {
  return importObjects(readTarGzJsonl(archive, 'zhs_ruling.json'), rulingMap, MtgchZhsRuling, MtgchZhsRuling.ruling, ['ruling'], [MtgchZhsRuling.ruling], onProgress);
}

/** Imports the zhs_set.json entry from an MTGCH archive. Returns the import report. */
export function importMtgchSet(archive: string, onProgress?: (done: number) => void): Promise<ImportCounts> {
  return importObjects(readTarGzJsonl(archive, 'zhs_set.json'), setMap, MtgchZhsSet, MtgchZhsSet.setId, ['setId'], [MtgchZhsSet.setId], onProgress);
}

/** Imports the zhs_type.json entry from an MTGCH archive. Returns the import report. */
export function importMtgchType(archive: string, onProgress?: (done: number) => void): Promise<ImportCounts> {
  return importObjects(
    readTarGzJsonl(archive, 'zhs_type.json'),
    typeMap,
    MtgchZhsType,
    [MtgchZhsType.typeName, MtgchZhsType.typeType],
    ['typeName', 'typeType'],
    [MtgchZhsType.typeName, MtgchZhsType.typeType],
    onProgress,
  );
}
