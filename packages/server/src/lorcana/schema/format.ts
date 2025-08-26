import { jsonb, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Format as IFormat } from '@model/lorcana/schema/format';

export const Format = schema.table('formats', {
    formatId: text('format_id').primaryKey(),

    localization: jsonb('localization').$type<IFormat['localization']>().notNull().default([]),
    sets:         jsonb('sets').$type<string[]>(),
    banlist:      jsonb('banlist').$type<IFormat['banlist']>().notNull().default([]),

    birthday:  text('birthday'),
    deathdate: text('deathdate'),

    tags: text('tags').array().notNull().default([]),
});
