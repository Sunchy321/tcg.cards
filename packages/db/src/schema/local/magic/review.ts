import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { appSchema } from '../../shared/magic/schema';

import { FieldCommit } from './field-sync';

/** Approval / override actions on field commits (magic_app). */
export const ImportReviewAction = appSchema.table('import_review_actions', {
  id:       uuid('id').primaryKey().defaultRandom(),
  commitId: uuid('commit_id')
    .notNull()
    .references(() => FieldCommit.id),
  action:    text('action').notNull(),
  actor:     text('actor').notNull(),
  note:      text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('import_review_actions_commit_id_idx').on(table.commitId),
  index('import_review_actions_actor_created_at_idx').on(table.actor, table.createdAt),
]);
