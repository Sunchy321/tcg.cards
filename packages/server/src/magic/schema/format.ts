import { jsonb, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Format as IFormat } from '@model/magic/schema/format';

export const Format = schema.table('formats', {
    formatId:     text('format_id').primaryKey(),
    localization: jsonb().$type<IFormat['localization']>().notNull(),

    sets:    text().array(),
    banlist: jsonb().$type<IFormat['banlist']>().default([]),

    birthday:  text(),
    deathdate: text(),

    tags: text().array().default([]),
});
