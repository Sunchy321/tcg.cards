import { integer, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Shared columns of the per-game image asset ledgers (`asset_images`).
 *
 * The image fact of record lives outside the fact tables so a fact-table
 * rebuild cannot lose it: one row per image file in the asset store
 * (CONTEXT.md, asset images). The factory admits only columns every game is
 * guaranteed to fill; a game's pipeline-specific fields join as typed
 * extension columns beside these, never as a grab-bag jsonb — the ledger's
 * value (audit, duplicate lookup, orphan enumeration) rests on queryable
 * columns.
 *
 * `key` is the sole locator: the object key within the bucket, or the path
 * under the local asset root. Both share one key layout (CONTEXT.md, local
 * asset bucket), so which store a deployment syncs to is configuration and
 * stays out of the rows; rows remain environment-neutral.
 *
 * Deletion is hard: a row asserts that a file exists at its key, and a
 * cleared file must not leave a ghost behind. The repo's soft-delete default
 * protects domain facts, which this import-side mirror does not hold; the
 * key namespace stays derivable from the domain tables.
 */
export const assetImageColumns = {
  key:        text('key').primaryKey(),
  format:     text('format').notNull(),
  source:     text('source').notNull(),
  sha256:     text('sha256').notNull(),
  width:      integer('width').notNull(),
  height:     integer('height').notNull(),
  byteSize:   integer('byte_size').notNull(),
  verifiedAt: timestamp('verified_at'),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
};
