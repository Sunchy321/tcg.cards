import { jsonb, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { FormatChange as IFormatChange } from '@model/lorcana/schema/format-change';

export const FormatChange = schema.table('format_changes', {
    source: text('source').notNull(),
    date:   text('date').notNull(),
    format: text('format').notNull(),
    link:   jsonb('link').$type<string[]>(),
    type:   text('type').notNull(),
    id:     text('id').notNull(),
    status: text('status').notNull(),
    group:  text('group'),
});
