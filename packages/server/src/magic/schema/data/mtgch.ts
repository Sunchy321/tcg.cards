import { jsonb, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { dataSchema } from '../schema';

import type { MtgchCard } from '@model/magic/schema/data/mtgch/card';

export const Mtgch = dataSchema.table('mtgch', {
    set:       text('set').notNull(),
    number:    text('number').notNull(),
    data:      jsonb('data').$type<MtgchCard>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
}, table => [
    primaryKey({ columns: [table.set, table.number] }),
]);
