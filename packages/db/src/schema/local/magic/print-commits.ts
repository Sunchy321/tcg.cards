import { index, jsonb, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/magic/schema';

/**
 * Printed surface override of one face slot of a print commit. Face slots
 * align with the anchored oracle's faces; a field left null falls back to the
 * same-position English print (the projection's print fallback chain).
 */
export interface PrintCommitFace {
  printedName?:     string | null;
  printedTypeLine?: string | null;
  printedText?:     string | null;
  flavorName?:      string | null;
  flavorText?:      string | null;
  artist?:          string | null;
  watermark?:       string | null;
}

/**
 * Print metadata overrides of a print commit. Absent fields clone the
 * same-position English print. Only fields a completion can legitimately
 * assert about the physical object are whitelisted.
 */
export interface PrintCommitMetadata {
  rarity?:        string;
  releaseDate?:   string;
  frame?:         string;
  borderColor?:   string;
  securityStamp?: string;
  finishes?:      string[];
  isDigital?:     boolean;
  isPromo?:       boolean;
  inBooster?:     boolean;
  promoTypes?:    string[];
  artistIds?:     string[];
}

/**
 * One manual submission completing a whole print position that no source
 * records — the whole-print sibling of a field commit. Anchored by the
 * Scryfall oracle the position belongs to, so the projection's existing match
 * resolves the card identity; the projection synthesizes reviewed commits as
 * print rows whose PK `source` is `manual` (a provenance tag, not authority
 * data). The commit row is the only copy of the data: rows are never
 * hard-deleted, `withdrawn`/`rejected` merely leave the projection.
 *
 * Status flow: draft → reviewed (takes effect); draft → rejected (kept so a
 * candidate generator never recreates it); reviewed → withdrawn (data kept,
 * no longer projected).
 */
export const PrintCommit = dataSchema.table('print_commits', {
  oracleId: uuid('oracle_id').notNull(),
  set:      text('set').notNull(),
  number:   text('number').notNull(),
  lang:     text('lang').notNull(),

  status: text('status').notNull().default('draft'),
  origin: text('origin').notNull().default('manual'),

  /** Per-face printed surfaces aligned with the oracle's face slots. */
  faces:    jsonb('faces').$type<PrintCommitFace[]>(),
  /** Optional print metadata overrides (absent fields clone the English print). */
  metadata: jsonb('metadata').$type<PrintCommitMetadata>(),
  /** Free-text provenance: where the committed data came from. */
  note:     text('note'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, table => [
  primaryKey({ columns: [table.oracleId, table.set, table.number, table.lang] }),
  index('print_commits_status_idx').on(table.status),
  index('print_commits_set_idx').on(table.set),
]);
