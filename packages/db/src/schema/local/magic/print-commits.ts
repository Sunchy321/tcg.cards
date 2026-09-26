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
 * Structured payload of a print commit beyond position, language, and the
 * printed faces: optional print attribute overrides (absent fields clone the
 * same-position English print) plus the face-aligned Gatherer multiverse IDs
 * fixed when the commit is written — whatever source provided the
 * translation, the multiverse id is Gatherer's to provide, since it is the
 * only upstream id space where a completion position exists. Absent ids mean
 * the cache had no full face coverage at write time; the projection then
 * emits the print without them.
 */
export interface PrintCommitData {
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
  multiverseIds?: number[];
}

/**
 * One manual submission completing a whole print position that no source
 * records — the whole-print sibling of a field commit. Anchored by the
 * Scryfall oracle the position belongs to, so the projection's existing match
 * resolves the card identity; the projection synthesizes commits as print
 * rows whose PK `source` is `manual` (a provenance tag, not authority data).
 *
 * Desktop-local single-user truth: the table has no review gate — a row
 * present here is projected as-is, and removing the row withdraws the print
 * (the projection's per-print recycle soft-deletes its fact rows). No sync,
 * no cloud: this table exists only in the local build database.
 */
export const PrintCommit = dataSchema.table('print_commits', {
  oracleId: uuid('oracle_id').notNull(),
  set:      text('set').notNull(),
  number:   text('number').notNull(),
  lang:     text('lang').notNull(),

  origin: text('origin').notNull().default('manual'),

  /** Per-face printed surfaces aligned with the oracle's face slots. */
  faces: jsonb('faces').$type<PrintCommitFace[]>(),
  /** Structured commit payload: attribute overrides + fixed multiverse IDs. */
  data:  jsonb('data').$type<PrintCommitData>(),
  /** Free-text provenance: where the committed data came from. */
  note:  text('note'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, table => [
  primaryKey({ columns: [table.oracleId, table.set, table.number, table.lang] }),
  index('print_commits_set_idx').on(table.set),
]);
