import { integer, jsonb, text } from 'drizzle-orm/pg-core';
import { schema } from './schema';

import * as gameChangeModel from '@model/hearthstone/schema/game-change';
import { CardChange as ICardChange, FormatChange as IFormatChange } from '@model/hearthstone/schema/game-change';

export const gameChangeType = schema.enum('game_change_type', gameChangeModel.gameChangeType.enum);
export const status = schema.enum('game_change_status', gameChangeModel.status.enum);

export const CardChange = schema.table('card_changes', {
    source:        text('source').notNull(),
    date:          text('date').notNull(),
    effectiveDate: text('effective_date'),
    name:          text('name').notNull(),
    version:       integer('version'),
    lastVersion:   integer('last_version'),
    link:          text('link').array().notNull().default([]),

    type:   gameChangeType('type').notNull(),
    format: text('format'),

    cardId: text('card_id').notNull(),
    setId:  text('set_id'),
    group:  text('group'),

    status: status('status').notNull(),
    score:  integer('score'),

    adjustment: jsonb('adjustment').$type<ICardChange['adjustment']>(),
});

export const SetChange = schema.table('set_changes', {
    source:        text('source').notNull(),
    date:          text('date').notNull(),
    effectiveDate: text('effective_date'),
    name:          text('name').notNull(),
    version:       integer('version'),
    lastVersion:   integer('last_version'),
    link:          text('link').array().notNull().default([]),

    type:   gameChangeType('type').notNull(),
    format: text('format'),

    setId: text('set_id').notNull(),

    status: status('status').notNull(),
    score:  integer('score'),
});

export const FormatChange = schema.table('format_changes', {
    source:        text('source').notNull(),
    date:          text('date').notNull(),
    effectiveDate: text('effective_date'),
    name:          text('name').notNull(),
    version:       integer('version'),
    lastVersion:   integer('last_version'),
    link:          text('link').array().notNull().default([]),

    type:   gameChangeType('type').notNull(),
    format: text('format'),

    cardId: text('card_id'),
    setId:  text('set_id'),
    ruleId: text('rule_id'),
    group:  text('group'),

    status: status('status'),
    score:  integer('score'),

    adjustment:   jsonb('adjustment').$type<IFormatChange['adjustment']>(),
    relatedCards: text('related_cards').array(),
});
