import { jsonb, text, boolean, integer } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { Card as ICard } from '@model/lorcana/schema/card';
import { Color, MainType, Category } from '@model/lorcana/schema/basic';

export const Card = schema.table('cards', {
    cardId: text('card_id').primaryKey(),

    cost:  integer('cost').notNull(),
    color: jsonb('color').$type<Color[]>().notNull(),

    inkwell: boolean('inkwell').notNull(),

    name:     text('name').notNull(),
    typeline: text('typeline').notNull(),
    text:     text('text').notNull(),

    type: jsonb('type').$type<{ main: MainType, sub?: string[] }>().notNull(),

    localization: jsonb('localization').$type<ICard['localization']>().notNull().default([]),

    lore:      integer('lore'),
    strength:  integer('strength'),
    willPower: integer('will_power'),
    moveCost:  integer('move_cost'),

    tags: jsonb('tags').$type<string[]>().notNull().default([]),

    category:   jsonb('category').$type<Category>().notNull(),
    legalities: jsonb('legalities').$type<ICard['legalities']>().notNull().default({}),
});
