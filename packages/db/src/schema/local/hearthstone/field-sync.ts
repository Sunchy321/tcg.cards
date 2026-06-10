import {
  bigint,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { dataSchema } from '../../shared/hearthstone/schema';

/** Cursor rows track the last pushed and pulled commit sequence for one local consumer. */
export const FieldSyncCursor = dataSchema.table('field_sync_cursors', {
  consumer: text('consumer').notNull(),
  stream:   text('stream').notNull(),

  lastPulledSequence: bigint('last_pulled_sequence', { mode: 'number' }).notNull().default(0),
  lastPushedSequence: bigint('last_pushed_sequence', { mode: 'number' }).notNull().default(0),

  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  primaryKey({ columns: [table.consumer, table.stream] }),
]);

/** Push batch history persisted after each tag push job. */
export const PushBatch = dataSchema.table('push_batches', {
  id: uuid('id').primaryKey().defaultRandom(),

  stream:   text('stream').notNull(),
  consumer: text('consumer').notNull(),

  status:          text('status').notNull(),
  pushedCount:     integer('pushed_count').notNull().default(0),
  duplicateCount:  integer('duplicate_count').notNull().default(0),
  blockedReason:   text('blocked_reason'),
  blockedMessage:  text('blocked_message'),
  blockedSequence: bigint('blocked_sequence', { mode: 'number' }),

  startedAt:   timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => [
  index('push_batches_stream_consumer_idx').on(table.stream, table.consumer),
  index('push_batches_created_at_idx').on(table.createdAt),
]);
