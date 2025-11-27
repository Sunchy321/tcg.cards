import { text, integer, primaryKey } from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const SetLocalization = schema.table('set_localizations', {
    setId: text('set_id').notNull(),
    lang:  text('lang').notNull(),
    name:  text('name').notNull(),
}, table => [
    primaryKey({ columns: [table.setId, table.lang] }),
]);

export const Set = schema.table('sets', {
    setId: text('set_id').primaryKey(),
    dbfId: integer('dbf_id'),
    slug:  text('slug'),

    type:          text('type').notNull(),
    releaseDate:   text('release_date').notNull(),
    cardCountFull: integer('card_count_full'),
    cardCount:     integer('card_count'),

    group: text('group'),
});

export const SetView = schema.view('set_view').as(qb => {
    return qb.select({
        setId:       Set.setId,
        dbfId:       Set.dbfId,
        slug:        Set.slug,
        type:        Set.type,
        releaseDate: Set.releaseDate,
        cardCount:   Set.cardCount,
        group:       Set.group,
    })
        .from(Set);
});
