import { text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/magic/schema';

/**
 * Resolved slug ownership/decisions for a card identity.
 *
 * One row per slug. Rows are only written when a slug went through a conflict /
 * disambiguation; never for natural unique slugs. A slug maps to zero or more
 * oracle ids (one card merged from several oracles → several ids). `resolvedTo`
 * records the slugs a disambiguated collision was split into.
 *
 * Open slug conflicts are NOT stored here — they live in `projection_review`
 * (kind `slug_conflict`) until resolved.
 */
export const CardSlugResolution = dataSchema.table('card_slug_resolutions', {
  slug:       text('slug').primaryKey(),
  oracleIds:  uuid('oracle_ids').array().notNull().default([]),
  resolvedTo: text('resolved_to').array().notNull().default([]),
  reason:     text('reason'),
  notes:      text('notes'),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
