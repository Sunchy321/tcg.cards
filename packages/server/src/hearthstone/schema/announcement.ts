import { integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';

import { schema } from './schema';

import { Adjustment } from '@model/hearthstone/schema/game-change';
import { AnnouncementItem as IAnnouncementItem } from '@model/hearthstone/schema/announcement';

import * as gameChangeModel from '@model/hearthstone/schema/game-change';

export const gameChangeType = schema.enum('game_change_type', gameChangeModel.gameChangeType.enum);
export const legality = schema.enum('legality', gameChangeModel.legality.enum);
export const status = schema.enum('status', gameChangeModel.status.enum);

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
    relatedCards: text('related_cards').array(),
});

export const Announcement = schema.table('announcements', {
    id:            uuid('id').primaryKey().defaultRandom(),
    source:        text('source').notNull(),
    date:          text('date').notNull(),
    effectiveDate: text('effective_date'),
    name:          text('name').notNull(),
    link:          text('link').array(),
    version:       integer('version').notNull(),
    lastVersion:   integer('last_version'),
});

export const AnnouncementView = schema.view('announcement_view').as(qb => {
    return qb
        .select({
            id:            Announcement.id,
            source:        Announcement.source,
            date:          Announcement.date,
            effectiveDate: Announcement.effectiveDate,
            name:          Announcement.name,
            link:          Announcement.link,
            version:       Announcement.version,
            lastVersion:   Announcement.lastVersion,

            changes: sql<IAnnouncementItem[]>`jsonb_agg(jsonb_build_object(
                'type', ${AnnouncementItem.type},
                'effectiveDate', ${AnnouncementItem.effectiveDate},
                'format', ${AnnouncementItem.format},
                'cardId', ${AnnouncementItem.cardId},
                'setId', ${AnnouncementItem.setId},
                'ruleId', ${AnnouncementItem.ruleId},
                'status', ${AnnouncementItem.status},
                'adjustment', ${AnnouncementItem.adjustment},
                'relatedCards', ${AnnouncementItem.relatedCards}
            ))`.as('changes'),
        })
        .from(Announcement)
        .leftJoin(AnnouncementItem, eq(Announcement.id, AnnouncementItem.announcementId))
        .groupBy(Announcement.id);
});
