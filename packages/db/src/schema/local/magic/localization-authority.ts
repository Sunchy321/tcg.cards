import { primaryKey, smallint, text, timestamp } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/magic/schema';
import { locale } from '../../shared/magic/card';

/**
 * Localization authority — the localized text of record, one row per
 * (card, version, locale, source), from which the display rows
 * (`card_localizations` / `card_part_localizations`) are derived.
 *
 * At most one row exists per (card, locale); `source` names the role the row
 * plays, never the translator:
 *   ''       official standard row — the oracle-aligned text in the official
 *            style. MTGCH supplies it for zhs; in every other language the
 *            newest print's text stands in until an oracle-aligned source
 *            exists.
 *   'mtgch'  folk substitute row — only when no official standard row can be
 *            formed, most often because the card has no official name in that
 *            language.
 *
 * The whole card's text lives on one row with its faces joined by a fixed
 * separator. The join is lossless — every face contributes exactly one segment,
 * empty faces included — so the per-face rows split back out exactly.
 * `partCount` says how many segments the joined values carry, which is what
 * makes that split well-defined: a single segment cannot otherwise be told
 * apart from a two-face card whose first face is empty.
 *
 * `sourceSet`/`sourceNumber`/`sourceReleaseDate` record which print established
 * the text. They are written only for rows whose text really is print-derived:
 * a row that uses MTGCH is overwritten by MTGCH whatever print it anchors to.
 */
export const CardLocalizationAuthority = dataSchema.table('card_localization_authorities', {
  cardId:  text('card_id').notNull(),
  version: text('version').notNull().default(''),
  locale:  locale('locale').notNull(),
  source:  text('source').notNull().default(''),

  name:      text('authority_name').notNull(),
  typeline:  text('authority_typeline').notNull(),
  text:      text('authority_text').notNull(),
  /** Faces the joined name / typeline / text encode. */
  partCount: smallint('part_count').notNull(),

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
  primaryKey({ columns: [table.cardId, table.version, table.locale, table.source] }),
]);
