import {
  bigint,
  boolean,
  check,
  index,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { CardSet } from './card-set';
import { schema } from './schema';

/** Exportable Shadowverse: Worlds Beyond card facts produced by the desktop import workflow. */
export const Card = schema.table('cards', {
  cardId: bigint('card_id', { mode: 'number' }).primaryKey(),
  baseCardId: bigint('base_card_id', { mode: 'number' }),
  cardResourceId: bigint('card_resource_id', { mode: 'number' }),
  originalCardId: bigint('original_card_id', { mode: 'number' }),

  cardSetId: integer('card_set_id').references(() => CardSet.cardSetId),

  type: integer('type'),
  class: integer('class'),
  rarity: integer('rarity'),
  cost: integer('cost'),
  atk: integer('atk'),
  life: integer('life'),
  tribes: integer('tribes').array(),

  isToken: boolean('is_token').notNull().default(false),
  isIncludeRotation: boolean('is_include_rotation'),
  deckEnabledNum: integer('deck_enabled_num'),
  isStarterAbilityChanged: boolean('is_starter_ability_changed'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, table => [
  index('cards_card_set_id_idx').on(table.cardSetId),
  index('cards_class_idx').on(table.class),
  index('cards_type_idx').on(table.type),
  index('cards_is_token_idx').on(table.isToken),
  index('cards_deleted_at_idx').on(table.deletedAt),
  check('cards_card_id_positive_chk', sql`${table.cardId} > 0`),
  check('cards_cost_nonnegative_chk', sql`${table.cost} is null or ${table.cost} >= 0`),
  check('cards_atk_nonnegative_chk', sql`${table.atk} is null or ${table.atk} >= 0`),
  check('cards_life_nonnegative_chk', sql`${table.life} is null or ${table.life} >= 0`),
  check('cards_deck_enabled_num_nonnegative_chk', sql`${table.deckEnabledNum} is null or ${table.deckEnabledNum} >= 0`),
]);
