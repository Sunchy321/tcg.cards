import {
  bigint,
  primaryKey,
  text,
  timestamp,
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
