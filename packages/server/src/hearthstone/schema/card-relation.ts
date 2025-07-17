import { integer, text, uuid } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const cardRelations = schema.table('card_relations', {
    id: uuid('id').primaryKey().defaultRandom(),

    relation: text('relation').notNull(),
    version:  integer('version').array(),
    sourceId: text('source_id').notNull(),
    targetId: text('target_id').notNull(),
});
