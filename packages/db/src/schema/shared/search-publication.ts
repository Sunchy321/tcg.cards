import { check, jsonb, pgTable, primaryKey, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** One public row per game for the active PostgreSQL search projection identity. */
export const SearchPublicationMetadata = pgTable('search_publication_metadata', {
  game:            text('game').notNull(),
  dataVersion:     text('data_version').notNull(),
  pgFingerprint:   text('pg_fingerprint').notNull(),
  releaseHash:     text('release_hash'),
  schemaVersion:   integer('schema_version').notNull(),
  ready:           boolean('ready').notNull().default(false),
  plannerMetadata: jsonb('planner_metadata').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt:       timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => [
  primaryKey({ columns: [table.game] }),
  check('search_publication_metadata_game_chk', sql`${table.game} IN ('magic', 'hearthstone')`),
  check('search_publication_metadata_schema_version_chk', sql`${table.schemaVersion} > 0`),
]);
