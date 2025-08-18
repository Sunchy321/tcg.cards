import { text, uuid, integer, jsonb } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { AdjustmentDetail } from '@interface/hearthstone/format-change';

export const formatChanges = schema.table('format_changes', {
    id: uuid('id').primaryKey().defaultRandom(),

    source: text('source').notNull(),
    date:   text('date').notNull(),
    name:   text('name').notNull(),
    format: text('format').notNull(),

    version:     integer('version'),
    lastVersion: integer('last_version'),

    link: text('link').array(),

    type:  text('type').notNull(),
    group: text('group'),

    setId:  text('set_id'),
    cardId: text('card_id'),

    status:        text('status'),
    adjustedParts: jsonb('adjusted_parts').$type<AdjustmentDetail[]>().array(),
    relatedCard:   text('related_card').array(),
});
