import { text, integer, primaryKey } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const setLocalizations = schema.table('set_localizations', {
    setId: text('set_id').notNull(),
    lang:  text('lang').notNull(),
    name:  text('name').notNull(),
}, table => [
    primaryKey({ columns: [table.setId, table.lang] }),
]);

export const sets = schema.table('sets', {
    setId: text('set_id').primaryKey(),
    dbfId: integer('dbf_id').notNull(),
    slug:  text('slug').notNull(),

    type:          text('type').notNull(),
    releaseDate:   text('release_date'),
    cardCountFull: integer('card_count_full'),
    cardCount:     integer('card_count'),

    group: text('group'),
});

export const setView = schema.view('set_view').as(qb => {
    return qb.select({
        setId:       sets.setId,
        dbfId:       sets.dbfId,
        slug:        sets.slug,
        type:        sets.type,
        releaseDate: sets.releaseDate,
        cardCount:   sets.cardCount,
        group:       sets.group,
    })
        .from(sets);
});
