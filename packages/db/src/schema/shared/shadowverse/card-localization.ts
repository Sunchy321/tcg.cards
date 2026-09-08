import {
  bigint,
  check,
  index,
  jsonb,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { Card } from './card';
import { lang } from './card-set';
import { schema } from './schema';

/** One official FAQ entry attached to a card, verbatim from the source API. */
export interface CardQuestion {
  question?: string;
  answer?: string;
  [key: string]: unknown;
}

/** Localized card facts, one row per card and language. Image hashes are language-specific. */
export const CardLocalization = schema.table('card_localizations', {
  cardId: bigint('card_id', { mode: 'number' })
    .notNull()
    .references(() => Card.cardId, { onDelete: 'cascade' }),
  lang: lang('lang').notNull(),

  name: text('name').notNull(),
  nameRuby: text('name_ruby'),
  skillText: text('skill_text'),
  flavourText: text('flavour_text'),
  cv: text('cv'),
  illustrator: text('illustrator'),
  questions: jsonb('questions').$type<CardQuestion[]>(),

  cardImageHash: varchar('card_image_hash', { length: 32 }).notNull(),
  cardBannerImageHash: varchar('card_banner_image_hash', { length: 32 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.lang] }),
  index('card_localizations_lang_idx').on(table.lang),
  index('card_localizations_card_image_hash_idx').on(table.cardImageHash),
  index('card_localizations_name_idx').on(table.name),
  check('card_localizations_name_nonempty_chk', sql`length(${table.name}) > 0`),
  check('card_localizations_card_image_hash_format_chk', sql`${table.cardImageHash} ~ '^[a-f0-9]{32}$'`),
  check('card_localizations_card_banner_image_hash_format_chk', sql`${table.cardBannerImageHash} is null or ${table.cardBannerImageHash} ~ '^[a-f0-9]{32}$'`),
]);
