import { integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';

import { schema } from './schema';

import { AdjustmentDetail } from '@interface/hearthstone/format-change';

export const announcementItems = schema.table('announcement_items', {
    id: uuid('id').primaryKey().defaultRandom(),

    announcementId: uuid('announcement_id').notNull(),
    format:         text('format').notNull(),

    type: text('type'),

    setId:  text('set_id'),
    cardId: text('card_id'),

    status:        text('status'),
    adjustedParts: jsonb('adjusted_parts').$type<AdjustmentDetail[]>().array(),
    relatedCard:   text('related_card').array(),

    effectiveDate: text('effective_date'),
    lastVersion:   integer('version'),
});

export const announcements = schema.table('announcements', {
    id: uuid('id').primaryKey().defaultRandom(),

    source: text('source').notNull(),
    date:   text('date').notNull(),
    name:   text('name').notNull(),

    version:     integer('version').notNull(),
    lastVersion: integer('last_version'),

    effectiveDate: text('effective_date'),

    links: text('links').array().default([]),
});

export const announcementView = schema.view('announcement_view').as(qb => {
    return qb.select({
        id: announcements.id,

        source: announcements.source,
        date:   announcements.date,
        name:   announcements.name,

        version:     announcements.version,
        lastVersion: announcements.lastVersion,

        effectiveDate: announcements.effectiveDate,

        links: announcements.links,

        format: announcementItems.format,

        type: announcementItems.type,

        setId:  announcementItems.setId,
        cardId: announcementItems.cardId,

        status:        announcementItems.status,
        adjustedParts: announcementItems.adjustedParts,
        relatedCard:   announcementItems.relatedCard,

        realEffectiveDate: sql`coalesce(${announcementItems.effectiveDate}, ${announcements.effectiveDate})`.as('real_effective_date'),
        realLastVersion:   sql`coalesce(${announcementItems.lastVersion}, ${announcements.lastVersion})`.as('real_last_version'),

    })
        .from(announcements)
        .leftJoin(announcementItems, eq(announcements.id, announcementItems.announcementId));
});
