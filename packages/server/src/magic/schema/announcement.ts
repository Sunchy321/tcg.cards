import { text, uuid } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';

import { schema } from './schema';

export const announcementItems = schema.table('announcement_items', {
    id: uuid('id').primaryKey().defaultRandom(),

    announcementId: uuid('announcement_id').notNull(),
    format:         text('format').notNull(),

    setIn:  text('set_in'),
    setOut: text('set_out'),

    cardId: text('card_id'),
    status: text('status'),

    effectiveDate: text('effective_date'),
});

export const announcements = schema.table('announcements', {
    id: uuid('id').primaryKey().defaultRandom(),

    source: text('source').notNull(),
    date:   text('date').notNull(),

    effectiveDate:         text('effective_date'),
    effectiveDateTabletop: text('effective_date_tabletop'),
    effectiveDateOnline:   text('effective_date_online'),
    effectiveDateArena:    text('effective_date_arena'),

    nextDate: text('next_date'),

    links: text('links').array().default([]),
});

export const announcementView = schema.view('announcement_view').as(qb => {
    return qb.select({
        id: announcements.id,

        source: announcements.source,
        date:   announcements.date,

        effectiveDate:         announcements.effectiveDate,
        effectiveDateTabletop: announcements.effectiveDateTabletop,
        effectiveDateOnline:   announcements.effectiveDateOnline,
        effectiveDateArena:    announcements.effectiveDateArena,

        nextDate: announcements.nextDate,

        links: announcements.links,

        format: announcementItems.format,

        setIn:  announcementItems.setIn,
        setOut: announcementItems.setOut,

        cardId: announcementItems.cardId,
        status: announcementItems.status,

        realEffectiveDate: sql`coalesce(${announcementItems.effectiveDate}, ${announcements.effectiveDate})`.as('real_effective_date'),
    })
        .from(announcements)
        .leftJoin(announcementItems, eq(announcements.id, announcementItems.announcementId));
});
