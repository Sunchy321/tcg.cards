import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Records completed remote search publications across games. */
export const SearchD1PublicationAudit = pgTable('search_d1_publication_audits', {
  taskRunId:   uuid('task_run_id').primaryKey(),
  game:        text('game').notNull(),
  userId:      text('user_id').notNull(),
  dataVersion: text('data_version').notNull(),
  releaseHash: text('release_hash').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
});
