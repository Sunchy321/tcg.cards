import { jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';

import { Adjustment } from '@model/magic/schema/game-change';

import { schema } from './schema';
import { gameChangeType } from './game-change';

export const AnnouncementRuleItem = schema.table('announcement_rule_items', {
    id:   uuid('id').primaryKey().defaultRandom(),
    lang: text('lang').notNull(),
    text: text('text').notNull(),
});

export const AnnouncementItem = schema.table('announcement_items', {
    id:             uuid('id').primaryKey().defaultRandom(),
    announcementId: uuid('announcement_id').notNull(),

    type:          gameChangeType('type').notNull(),
    effectiveDate: text('effective_date'),
    range:         text('range').array().default([]),

    cardId: text('card_id'),
    setId:  text('set_id'),
    ruleId: uuid('rule_id'),

    status: text('status'),

    adjustment:   jsonb('adjustment').$type<Adjustment[]>(),
    relatedCards: text('related_cards').array().default([]),
});

export const Announcement = schema.table('announcements', {
    id: uuid('id').primaryKey().defaultRandom(),

    source: text('source').notNull(),
    date:   text('date').notNull(),
    name:   text('name').notNull(),

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

        effectiveDate:         sql`coalesce(${AnnouncementItem.effectiveDate}, ${Announcement.effectiveDate})`.as('effective_date'),
        effectiveDateTabletop: Announcement.effectiveDateTabletop,
        effectiveDateOnline:   Announcement.effectiveDateOnline,
        effectiveDateArena:    Announcement.effectiveDateArena,

        nextDate: Announcement.nextDate,

        links: Announcement.links,

        type:  AnnouncementItem.type,
        range: AnnouncementItem.range,

        cardId: AnnouncementItem.cardId,
        setId:  AnnouncementItem.setId,
        ruleId: AnnouncementItem.ruleId,

        status: AnnouncementItem.status,

        adjustment:   AnnouncementItem.adjustment,
        relatedCards: AnnouncementItem.relatedCards,

        lang: AnnouncementRuleItem.lang,
        text: AnnouncementRuleItem.text,
    })
        .from(Announcement)
        .leftJoin(AnnouncementItem, eq(Announcement.id, AnnouncementItem.announcementId))
        .leftJoin(AnnouncementRuleItem, eq(AnnouncementItem.ruleId, AnnouncementRuleItem.id));
});
