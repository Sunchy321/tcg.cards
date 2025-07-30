import { text, uuid } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const CycleItem = schema.table('cycle_items', {
    id: uuid('id').primaryKey().defaultRandom(),

    cycleId: uuid('cycle_id').notNull(),
    key:     text('color').notNull(),
    cardId:  text('card_id').notNull(),
});

export const Cycle = schema.table('cycles', {
    id: uuid('id').primaryKey().defaultRandom(),

    keys: text('keys').array().notNull(),
});
