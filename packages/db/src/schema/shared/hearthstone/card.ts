import { getColumns, sql } from 'drizzle-orm';
import { index, jsonb, text, timestamp } from 'drizzle-orm/pg-core';

import { ambit } from '../ambit';

import { schema } from './schema';

import type { Card as ICard } from '#model/hearthstone/schema/card';

export const BaseCard = schema.table('cards', {
  cardId: text('card_id').primaryKey(),

  /** Card ambit (ADR 0015) — a per-card, version-independent classification
   * derived from entity content and the relation graph; never user-written. */
  ambit: ambit('ambit').notNull().default('full'),

  legalities: jsonb('legalities').$type<ICard['legalities']>().notNull().default({}),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  index('cards_deleted_at_idx').on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
]);

export const Card = schema.view('active_cards').as(qb =>
  qb.select({ ...getColumns(BaseCard) })
    .from(BaseCard)
    .where(sql`${BaseCard.deletedAt} is null`),
);
