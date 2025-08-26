import { jsonb, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const CardRelation = schema.table('card_relations', {
    relation:      text('relation').notNull(),
    sourceId:      text('source_id').notNull(),
    targetId:      text('target_id').notNull(),
    targetVersion: jsonb('target_version').$type<{
        set:    string;
        number: string;
        lang?:  string;
    }>(),
});
