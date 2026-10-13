import { text, timestamp } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/magic/schema';
import { ambit } from '../../shared/ambit';

/**
 * Reviewed ambit override for one card (ADR 0015). The classification seed is
 * a rebuildable projection of source signals; a row here is the maintainer's
 * word on the card's ambit and replaces the seed at projection merge time.
 *
 * Desktop-local single-user authority, following `print_commits`: no review
 * gate — a row present is projected as-is, and deleting the row withdraws the
 * override (the next projection seeds the card again). No sync, no cloud:
 * this table exists only in the local build database, and the projection
 * never writes it, so re-projection cannot lose an override.
 */
export const CardAmbitOverride = dataSchema.table('card_ambit_overrides', {
  cardId: text('card_id').primaryKey(),
  ambit:  ambit('ambit').notNull(),

  /** Short maintainer rationale for the override (shown in the console). */
  reason: text('reason'),
  /** Free-text provenance: where the override decision came from. */
  note:   text('note'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
