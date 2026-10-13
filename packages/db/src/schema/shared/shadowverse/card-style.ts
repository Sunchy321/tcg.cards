import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { Card } from './card';
import { lang } from './card-set';
import { schema } from './schema';

/** Alternate card art ("style") facts; styles match across languages by source list position. */
export const CardStyle = schema.table('card_styles', {
  cardId: bigint('card_id', { mode: 'number' })
    .notNull()
    .references(() => Card.cardId, { onDelete: 'cascade' }),
  styleIndex: integer('style_index').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.styleIndex] }),
  check('card_styles_style_index_nonnegative_chk', sql`${table.styleIndex} >= 0`),
]);

/** Localized alternate-art facts; image hashes are language-specific. */
export const CardStyleLocalization = schema.table('card_style_localizations', {
  cardId: bigint('card_id', { mode: 'number' }).notNull(),
  styleIndex: integer('style_index').notNull(),
  lang: lang('lang').notNull(),

  name: text('name'),
  nameRuby: text('name_ruby'),
  cv: text('cv'),
  illustrator: text('illustrator'),
  skillText: text('skill_text'),
  flavourText: text('flavour_text'),
  evoFlavourText: text('evo_flavour_text'),

  cardImageHash: varchar('card_image_hash', { length: 32 }).notNull(),
  evoCardImageHash: varchar('evo_card_image_hash', { length: 32 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.styleIndex, table.lang] }),
  // Composite FK: card_styles has no single-column unique key, so the reference
  // must cover the full (card_id, style_index) primary key.
  foreignKey({
    name: 'card_style_localizations_card_style_fk',
    columns: [table.cardId, table.styleIndex],
    foreignColumns: [CardStyle.cardId, CardStyle.styleIndex],
  }).onDelete('cascade'),
  index('card_style_localizations_card_image_hash_idx').on(table.cardImageHash),
  check('card_style_localizations_card_image_hash_format_chk', sql`${table.cardImageHash} ~ '^[a-f0-9]{32}$'`),
  check('card_style_localizations_evo_card_image_hash_format_chk', sql`${table.evoCardImageHash} is null or ${table.evoCardImageHash} ~ '^[a-f0-9]{32}$'`),
]);
