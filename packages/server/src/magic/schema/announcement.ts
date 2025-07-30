import { text, uuid } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';

import { schema } from './schema';

export const AnnouncementItem = schema.table('announcement_items', {
    id: uuid('id').primaryKey().defaultRandom(),

    announcementId: uuid('announcement_id').notNull(),
    format:         text('format').notNull(),

    type: text('type'),

    setId:  text('set_id'),
    cardId: text('card_id'),

    status: text('status'),

    effectiveDate: text('effective_date'),
});

export const Announcement = schema.table('announcements', {
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

export const AnnouncementView = schema.view('announcement_view').as(qb => {
    return qb.select({
        id: Announcement.id,

        source: Announcement.source,
        date:   Announcement.date,

        effectiveDate:         Announcement.effectiveDate,
        effectiveDateTabletop: Announcement.effectiveDateTabletop,
        effectiveDateOnline:   Announcement.effectiveDateOnline,
        effectiveDateArena:    Announcement.effectiveDateArena,

        nextDate: Announcement.nextDate,

        links: Announcement.links,

        format: AnnouncementItem.format,

        setIn:  AnnouncementItem.setId,
        cardId: AnnouncementItem.cardId,

        status: AnnouncementItem.status,

        realEffectiveDate: sql`coalesce(${AnnouncementItem.effectiveDate}, ${Announcement.effectiveDate})`.as('real_effective_date'),
    })
        .from(Announcement)
        .leftJoin(AnnouncementItem, eq(Announcement.id, AnnouncementItem.announcementId));
});
