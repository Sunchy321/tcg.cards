import { text, uuid } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const CardRelation = schema.table('card_relations', {
    id: uuid('id').primaryKey().defaultRandom(),

    relation: text('relation').notNull(),
    sourceId: text('source_id').notNull(),
    targetId: text('target_id').notNull(),

    targetSet:    text('target_set'),
    targetNumber: text('target_number'),
    targetLang:   text('target_lang'),
});
