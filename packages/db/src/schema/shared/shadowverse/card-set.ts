import {
  check,
  index,
  integer,
  pgEnum,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { schema } from './schema';

/** Languages served by the official Shadowverse: Worlds Beyond card data API `Lang` header. */
export const lang = schema.enum('lang', ['ja', 'en', 'chs', 'cht', 'ko']);

/** Card pack (card set) facts from the official card list API. */
export const CardSet = schema.table('card_sets', {
  cardSetId: integer('card_set_id').primaryKey(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  index('card_sets_deleted_at_idx').on(table.deletedAt),
]);

/** Localized card pack names, one row per card set and language. */
export const CardSetLocalization = schema.table('card_set_localizations', {
  cardSetId: integer('card_set_id')
    .notNull()
    .references(() => CardSet.cardSetId, { onDelete: 'cascade' }),
  lang: lang('lang').notNull(),
  name: text('name').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.cardSetId, table.lang] }),
  check('card_set_localizations_name_nonempty_chk', sql`length(${table.name}) > 0`),
]);
