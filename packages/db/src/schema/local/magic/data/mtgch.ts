import { index, integer, jsonb, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../../shared/magic/schema';

/**
 * MTGCH exported Chinese-localization dataset caches. MTGCH no longer exposes a
 * web API; the source is a set of JSONL files under
 * `../data/magic/mtgch/magic-cards-zhs-data-<date>/`. The scryfall_card.json
 * skeleton is not cached — the Scryfall source already provides card data.
 *   zhs_card.json       per-card Chinese name / type line / text
 *   zhs_oracle.json     per-oracle Chinese translations
 *   zhs_flavor.json     Chinese flavor text
 *   zhs_ruling.json     Chinese ruling translations
 *   zhs_set.json        Chinese set names
 *   zhs_type.json       Chinese type / subtype / supertype translations
 */

/** Per-card Chinese name / type line / text from zhs_card.json. */
export const MtgchZhsCard = dataSchema.table('mtgch_zhs_card', {
  cardId:       text('card_id').primaryKey(),
  name:         text('name'),
  faceName:     text('face_name'),
  flavorName:   text('flavor_name'),
  typeLine:     text('type_line'),
  text:         text('text'),
  flavorText:   text('flavor_text'),
  multiverseId: integer('multiverse_id'),
  source:       text('source'),
  extra:        jsonb('extra').$type<unknown>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
});

/** Per-oracle Chinese translations from zhs_oracle.json. */
export const MtgchZhsOracle = dataSchema.table('mtgch_zhs_oracle', {
  faceOracleId:    text('face_oracle_id').primaryKey(),
  oracleId:        text('oracle_id').notNull(),
  name:            text('name').notNull(),
  set:             text('set').notNull(),
  collectorNumber: text('collector_number').notNull(),
  releasedAt:      text('released_at').notNull(),
  typeLine:        text('type_line').notNull(),
  oracleText:      text('oracle_text'),
  translatedName:  text('translated_name'),
  nameStage:       integer('name_stage'),
  nameSource:      text('name_source'),
  translatedType:  text('translated_type'),
  typeStage:       integer('type_stage'),
  translatedText:  text('translated_text'),
  textStage:       integer('text_stage'),
  textSource:      text('text_source'),
  formerNames:     jsonb('former_names').$type<unknown>(),
  extra:           jsonb('extra').$type<unknown>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, table => [
  index('mtgch_zhs_oracle_oracle_id_idx').on(table.oracleId),
]);

/** Chinese flavor text from zhs_flavor.json. */
export const MtgchZhsFlavor = dataSchema.table('mtgch_zhs_flavor', {
  flavorId:             text('flavor_id').primaryKey(),
  name:                 text('name'),
  flavorName:           text('flavor_name'),
  flavorText:           text('flavor_text'),
  set:                  text('set'),
  collectorNumber:      text('collector_number'),
  releasedAt:           text('released_at'),
  translatedFlavorName: text('translated_flavor_name'),
  translatedFlavorText: text('translated_flavor_text'),
  flavorUpdatedAt:      text('flavor_updated_at'),
  source:               text('source'),
  stage:                integer('stage'),
  extra:                jsonb('extra').$type<unknown>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
});

/** Chinese ruling translations from zhs_ruling.json. */
export const MtgchZhsRuling = dataSchema.table('mtgch_zhs_ruling', {
  ruling:          text('ruling').primaryKey(),
  comment:         text('comment').notNull(),
  translation:     text('translation').notNull(),
  source:          text('source'),
  stage:           integer('stage'),
  lastPublishedAt: text('last_published_at'),
  extra:           jsonb('extra').$type<unknown>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
});

/** Chinese set names from zhs_set.json. */
export const MtgchZhsSet = dataSchema.table('mtgch_zhs_set', {
  setId:  text('set_id').primaryKey(),
  code:   text('code').notNull(),
  name:   text('name').notNull(),
  source: text('source'),
  stage:  integer('stage'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
});

/** Chinese type / subtype / supertype translations from zhs_type.json. */
export const MtgchZhsType = dataSchema.table('mtgch_zhs_type', {
  typeName:    text('type_name').notNull(),
  typeType:    text('type_type').notNull(),
  translation: text('translation'),
  stage:       integer('stage'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.typeName, table.typeType] }),
]);
