import { primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/magic/schema';
import { locale } from '../../shared/magic/card';

/**
 * Unified localization — one row per (card, version, locale), the oracle-aligned
 * localized text used for search. For Simplified/Traditional Chinese and English
 * it reflects the current oracle rules; for other languages it holds the latest
 * print's localized text. `sourceSet`/`sourceNumber`/`sourceReleaseDate` record
 * which print established the text so older-print re-imports never overwrite it.
 */
export const CardUnifiedLocalization = dataSchema.table('card_unified_localizations', {
  cardId:  text('card_id').notNull(),
  version: text('version').notNull().default(''),
  locale:  locale('locale').notNull(),
  // Winner localization source: '' = established by an official print (recorded
  // in sourceSet/sourceNumber/sourceReleaseDate), 'mtgch' = established by the
  // community Chinese translation. English canonical text is never stored here.
  source:  text('source').notNull().default(''),

  name:       text('unified_name').notNull(),
  typeline:   text('unified_typeline').notNull(),
  text:       text('unified_text').notNull(),
  flavorText: text('unified_flavor_text'),

  sourceSet:         text('source_set'),
  sourceNumber:      text('source_number'),
  sourceReleaseDate: text('source_release_date'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.locale] }),
]);
