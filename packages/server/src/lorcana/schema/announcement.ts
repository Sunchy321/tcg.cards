import { jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';

import { Adjustment } from '@model/lorcana/schema/game-change';

import { schema } from './schema';
import { gameChangeType, status } from './game-change';

export const AnnouncementRuleItem = schema.table('announcement_rule_items', {
    id:   text('id').primaryKey(),
    lang: text('lang').notNull(),
    text: text('text').notNull(),
});

export const AnnouncementItem = schema.table('announcement_items', {
    id:             uuid('id').primaryKey().defaultRandom(),
    announcementId: uuid('announcement_id').notNull(),

    type:          gameChangeType('type').notNull(),
    effectiveDate: text('effective_date'),
    format:        text('format'),

    cardId: text('card_id'),
    setId:  text('set_id'),
    ruleId: text('rule_id'),

    status: status('status'),

    adjustment:   jsonb('adjustment').$type<Adjustment[]>(),
    relatedCards: text('related_cards').array().default([]),
});

export const Announcement = schema.table('announcements', {
    id: uuid('id').primaryKey().defaultRandom(),

    source: text('source').notNull(),
    date:   text('date').notNull(),
    name:   text('name').notNull(),

    effectiveDate: text('effective_date'),

    nextDate: text('next_date'),

    link: text('link').array().notNull().default([]),
});

export const AnnouncementView = schema.view('announcement_view').as(qb => {
    return qb.select({
        id: Announcement.id,

        source: Announcement.source,
        date:   Announcement.date,
        name:   Announcement.name,

        effectiveDate: sql<string | null>`coalesce(${AnnouncementItem.effectiveDate}, ${Announcement.effectiveDate})`
            .as('effective_date'),

        nextDate: Announcement.nextDate,

        link: Announcement.link,

        type:   AnnouncementItem.type,
        format: AnnouncementItem.format,

        cardId: AnnouncementItem.cardId,
        setId:  AnnouncementItem.setId,
        ruleId: AnnouncementItem.ruleId,

        status: AnnouncementItem.status,

        adjustment:   AnnouncementItem.adjustment,
        relatedCards: AnnouncementItem.relatedCards,
    })
        .from(Announcement)
        .leftJoin(AnnouncementItem, eq(Announcement.id, AnnouncementItem.announcementId));
});
