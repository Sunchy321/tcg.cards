import { db } from '@tcg-cards/db/db';
import {
  MtgchZhsCard,
  MtgchZhsFlavor,
  MtgchZhsOracle,
  MtgchZhsRuling,
  MtgchZhsSet,
  MtgchZhsType,
} from '@tcg-cards/db/schema/local/magic';

import { pickSnake, readJsonl } from '../jsonl';

const BATCH = 1000;
const CACHE_MS = 30 * 24 * 3600 * 1000;

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
  return { ...pickSnake(obj, map as never), extra: obj.extra ?? null, expiresAt: new Date(Date.now() + CACHE_MS) } as unknown as T;
}

/** Streams a zhs file, inserting in batches; returns rows inserted. */
async function importZhsFile<T>(file: string, map: Record<string, string>, table: any): Promise<number> {
  let count = 0;
  let batch: T[] = [];
  for await (const obj of readJsonl(file)) {
    batch.push(zhsRow<T>(obj, map));
    if (batch.length >= BATCH) {
      await db.insert(table).values(batch as never).onConflictDoNothing();
      count += batch.length;
      batch = [];
    }
  }
  if (batch.length) {
    await db.insert(table).values(batch as never).onConflictDoNothing();
    count += batch.length;
  }
  return count;
}

/** Imports zhs_card.json into mtgch_zhs_card. Returns rows inserted. */
export function importMtgchCard(file: string): Promise<number> {
  return importZhsFile<typeof MtgchZhsCard.$inferInsert>(file, cardMap, MtgchZhsCard);
}

/** Imports zhs_oracle.json into mtgch_zhs_oracle. Returns rows inserted. */
export function importMtgchOracle(file: string): Promise<number> {
  return importZhsFile<typeof MtgchZhsOracle.$inferInsert>(file, oracleMap, MtgchZhsOracle);
}

/** Imports zhs_flavor.json into mtgch_zhs_flavor. Returns rows inserted. */
export function importMtgchFlavor(file: string): Promise<number> {
  return importZhsFile<typeof MtgchZhsFlavor.$inferInsert>(file, flavorMap, MtgchZhsFlavor);
}

/** Imports zhs_ruling.json into mtgch_zhs_ruling. Returns rows inserted. */
export function importMtgchRuling(file: string): Promise<number> {
  return importZhsFile<typeof MtgchZhsRuling.$inferInsert>(file, rulingMap, MtgchZhsRuling);
}

/** Imports zhs_set.json into mtgch_zhs_set. Returns rows inserted. */
export function importMtgchSet(file: string): Promise<number> {
  return importZhsFile<typeof MtgchZhsSet.$inferInsert>(file, setMap, MtgchZhsSet);
}

/** Imports zhs_type.json into mtgch_zhs_type. Returns rows inserted. */
export function importMtgchType(file: string): Promise<number> {
  return importZhsFile<typeof MtgchZhsType.$inferInsert>(file, typeMap, MtgchZhsType);
}
