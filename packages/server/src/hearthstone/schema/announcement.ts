import { integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';

import { schema } from './schema';

import { Adjustment as IAdjustment, GameChange as IGameChange } from '@model/hearthstone/schema/game-change';

import * as gameChangeModel from '@model/hearthstone/schema/game-change';

export const GameChangeType = schema.enum('game_change_type', gameChangeModel.gameChangeType.enum);
export const Legality = schema.enum('legality', gameChangeModel.legality.enum);
export const Status = schema.enum('status', gameChangeModel.status.enum);

export const GameChange = schema.table('game_changes', {
    id:             uuid('id').primaryKey().defaultRandom(),
    announcementId: uuid('announcement_id').notNull(),

    type:          GameChangeType('type').notNull(),
    effectiveDate: text('effective_date'),
    range:         text('range').array(),

    cardId: text('card_id'),
    setId:  text('set_id'),
    ruleId: text('rule_id'),

    status: Status('status'),

    adjustments: jsonb('adjustments').$type<IAdjustment[]>().array(),

    relatedCards: text('related_cards').array(),
});

export const GameChangeRuleText = schema.table('game_change_rule_texts', {
    id:   uuid('id').primaryKey().defaultRandom(),
    lang: text('lang').notNull(),

    text: text('text').notNull(),
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

            changes: sql<IGameChange[]>`jsonb_agg(jsonb_build_object(
                'type', ${GameChange.type},
                'effectiveDate', ${GameChange.effectiveDate},
                'range', ${GameChange.range},
                'cardId', ${GameChange.cardId},
                'setId', ${GameChange.setId},
                'ruleId', ${GameChange.ruleId},
                'status', ${GameChange.status},
                'adjustments', ${GameChange.adjustments}
            ))`.as('changes'),
        })
        .from(Announcement)
        .leftJoin(GameChange, eq(Announcement.id, GameChange.announcementId))
        .groupBy(Announcement.id);
});
