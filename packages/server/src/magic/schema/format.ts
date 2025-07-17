import { jsonb, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Format as IFormat } from '@interface/magic/format';

export const formats = schema.table('formats', {
    formatId:     text('format_id').primaryKey(),
    localization: jsonb().$type<IFormat['localization']>().notNull(),

    sets:    text().array(),
    banlist: jsonb().$type<IFormat['banlist']>().default([]),

    birthday:  text(),
    deathdate: text(),

    tags: text().array().default([]),
});
