import { jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { schema } from './schema';

import * as gameChangeModel from '@model/magic/schema/game-change';
import { Adjustment } from '@model/magic/schema/game-change';

export const gameChangeType = schema.enum('game_change_type', gameChangeModel.gameChangeType.enum);
export const status = schema.enum('game_change_status', gameChangeModel.status.enum);

export const GameChange = schema.table('game_changes', {
    id: uuid('id').primaryKey().defaultRandom(),

    source:        text('source').notNull(),
    date:          text('date').notNull(),
    effectiveDate: text('effective_date'),
    name:          text('name').notNull(),
    link:          text('link').array().notNull(),

    type:  gameChangeType('type').notNull(),
    range: text('range').array(),

    cardId:   text('card_id'),
    setId:    text('set_id'),
    formatId: text('format_id'),

    status: status('status'),
    group:  text('group'),

    adjustments: jsonb('adjustments').$type<Adjustment[]>(),
});
