import { text, integer, jsonb } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import type { SetLocalization as ISetLocalization } from '#model/hearthstone/schema/set';

export const Set = schema.table('sets', {
  setId:   text('set_id').primaryKey(),
  dbfId:   integer('dbf_id'),
  rawName: text('raw_name'),

  type:          text('type').notNull(),
  releaseDate:   text('release_date').notNull(),
  cardCountFull: integer('card_count_full'),
  cardCount:     integer('card_count'),

  group:        text('group'),
  year:         text('year'),
  localization: jsonb('localization').$type<ISetLocalization>().notNull().default({}),
});
