import {
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { schema } from './schema';

/** Shadowverse Evolve card pack facts from the official card list. */
export const EvolveCardSet = schema.table('evolve_card_sets', {
  cardSetCode: text('card_set_code').primaryKey(),

  name: text('name').notNull(),
  releaseDate: text('release_date'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  index('evolve_card_sets_deleted_at_idx').on(table.deletedAt),
  check('evolve_card_sets_name_nonempty_chk', sql`length(${table.name}) > 0`),
]);

/** Exportable Shadowverse Evolve card facts produced by the desktop import workflow. */
export const EvolveCard = schema.table('evolve_cards', {
  cardNo: text('card_no').primaryKey(),

  cardSetCode: text('card_set_code').references(() => EvolveCardSet.cardSetCode),

  craft: text('craft'),
  cardType: text('card_type'),
  tribes: text('tribes'),
  rarity: text('rarity'),
  cost: integer('cost'),
  attack: integer('attack'),
  life: integer('life'),

  relatedCardNos: text('related_card_nos').array(),

  /** Official image paths scraped from each card's detail page; casing varies by set. */
  imageUrlJa: text('image_url_ja'),
  imageUrlEn: text('image_url_en'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  index('evolve_cards_card_set_code_idx').on(table.cardSetCode),
  index('evolve_cards_craft_idx').on(table.craft),
  index('evolve_cards_rarity_idx').on(table.rarity),
  index('evolve_cards_deleted_at_idx').on(table.deletedAt),
]);

/** Localized Evolve card facts, one row per card and language. */
export const EvolveCardLocalization = schema.table('evolve_card_localizations', {
  cardNo: text('card_no')
    .notNull()
    .references(() => EvolveCard.cardNo, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),

  name: text('name').notNull(),
  skillText: text('skill_text'),
  flavourText: text('flavour_text'),
  illustrator: text('illustrator'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.cardNo, table.lang] }),
  index('evolve_card_localizations_lang_idx').on(table.lang),
  index('evolve_card_localizations_name_idx').on(table.name),
  check('evolve_card_localizations_lang_chk', sql`${table.lang} in ('ja', 'en', 'zh-cn')`),
  check('evolve_card_localizations_name_nonempty_chk', sql`length(${table.name}) > 0`),
]);

/** One official Q&A entry attached to one Evolve card, verbatim from the source. */
export const EvolveCardQuestion = schema.table('evolve_card_questions', {
  id: text('id').primaryKey(),

  cardNo: text('card_no')
    .notNull()
    .references(() => EvolveCard.cardNo, { onDelete: 'cascade' }),

  question: text('question').notNull(),
  answer: text('answer').notNull(),
  answeredAt: text('answered_at'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('evolve_card_questions_card_no_idx').on(table.cardNo),
]);
