import {
  bigint,
  check,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { Card } from './card';
import { lang } from './card-set';
import { schema } from './schema';

/** Evolution-state facts for one card; row presence marks the card as having an evolution. */
export const CardEvolution = schema.table('card_evolutions', {
  cardId: bigint('card_id', { mode: 'number' })
    .primaryKey()
    .references(() => Card.cardId, { onDelete: 'cascade' }),
  cardResourceId: bigint('card_resource_id', { mode: 'number' }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  check('card_evolutions_card_resource_id_positive_chk', sql`${table.cardResourceId} is null or ${table.cardResourceId} > 0`),
]);

/** Localized evolution-state facts; image hashes are language-specific. */
export const CardEvolutionLocalization = schema.table('card_evolution_localizations', {
  cardId: bigint('card_id', { mode: 'number' })
    .notNull()
    .references(() => CardEvolution.cardId, { onDelete: 'cascade' }),
  lang: lang('lang').notNull(),

  skillText: text('skill_text'),
  flavourText: text('flavour_text'),
  cardImageHash: varchar('card_image_hash', { length: 32 }).notNull(),
  cardBannerImageHash: varchar('card_banner_image_hash', { length: 32 }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.lang] }),
  check('card_evolution_localizations_card_image_hash_format_chk', sql`${table.cardImageHash} ~ '^[a-f0-9]{32}$'`),
  check('card_evolution_localizations_card_banner_image_hash_format_chk', sql`${table.cardBannerImageHash} is null or ${table.cardBannerImageHash} ~ '^[a-f0-9]{32}$'`),
]);
