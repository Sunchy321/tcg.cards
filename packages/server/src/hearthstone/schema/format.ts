import { text, primaryKey, jsonb } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Format as IFormat } from '@interface/hearthstone/format';

export const formatLocalizations = schema.table('format_localizations', {
    formatId: text('format_id').notNull(),
    lang:     text('lang').notNull(),

    name: text('name').notNull(),
}, table => [
    primaryKey({ columns: [table.formatId, table.lang] }),
]);

export const formats = schema.table('formats', {
    formatId:     text('format_id').primaryKey().notNull(),
    localization: jsonb().$type<IFormat['localization']>().notNull(),

    sets:    text('sets').array(),
    banlist: jsonb('banlist').default([]),

    birthday:  text('birthday'),
    deathdate: text('deathdate'),
});

export const formatView = schema.view('format_view').as(qb => {
    return qb.select({
        formatId:  formats.formatId,
        sets:      formats.sets,
        banlist:   formats.banlist,
        birthday:  formats.birthday,
        deathdate: formats.deathdate,
    })
        .from(formats);
});
