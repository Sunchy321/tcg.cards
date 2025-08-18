import { jsonb, text } from 'drizzle-orm/pg-core';
import { schema } from './schema';

import * as gameChangeModel from '@model/magic/schema/game-change';
import { Adjustment } from '@model/magic/schema/game-change';

export const gameChangeType = schema.enum('game_change_type', gameChangeModel.gameChangeType.enum);
export const status = schema.enum('game_change_status', gameChangeModel.status.enum);

export const CardChange = schema.table('card_changes', {
    source:        text('source').notNull(),
    date:          text('date').notNull(),
    effectiveDate: text('effective_date'),
    name:          text('name').notNull(),
    link:          text('link').array().notNull().default([]),

    type:   gameChangeType('type').notNull(),
    format: text('format'),

    cardId: text('card_id').notNull(),
    setId:  text('set_id'),
    group:  text('group'),

    status: status('status').notNull(),

    adjustment: jsonb('adjustment').$type<Adjustment[]>(),
});

export const SetChange = schema.table('set_changes', {
    source:        text('source').notNull(),
    date:          text('date').notNull(),
    effectiveDate: text('effective_date'),
    name:          text('name').notNull(),
    link:          text('link').array().notNull().default([]),

    type:   gameChangeType('type').notNull(),
    format: text('format'),

    setId: text('set_id').notNull(),

    status: status('status').notNull(),
});

export const FormatChange = schema.table('format_changes', {
    source:        text('source').notNull(),
    date:          text('date').notNull(),
    effectiveDate: text('effective_date'),
    name:          text('name').notNull(),
    link:          text('link').array().notNull().default([]),

    type:   gameChangeType('type').notNull(),
    format: text('format'),

    cardId: text('card_id'),
    setId:  text('set_id'),
    ruleId: text('rule_id'),
    group:  text('group'),

    status: status('status'),

    adjustment: jsonb('adjustment').$type<Adjustment[]>(),
});
