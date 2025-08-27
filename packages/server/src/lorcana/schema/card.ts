import { jsonb, text, boolean, integer } from 'drizzle-orm/pg-core';
import { eq, getTableColumns } from 'drizzle-orm';

import { schema } from './schema';

import _ from 'lodash';

import { Updation } from '@model/basic';
import { Card as ICard } from '@model/lorcana/schema/card';
import { Color, MainType, Category } from '@model/lorcana/schema/basic';

import * as basicModel from '@model/lorcana/schema/basic';

export const locale = schema.enum('locale', basicModel.locale.enum);

export const Card = schema.table('cards', {
    cardId: text('card_id').primaryKey(),

    cost:  integer('cost').notNull(),
    color: jsonb('color').$type<Color[]>().notNull(),

    inkwell: boolean('inkwell').notNull(),

    name:     text('name').notNull(),
    typeline: text('typeline').notNull(),
    text:     text('text').notNull(),

    type: jsonb('type').$type<{ main: MainType, sub?: string[] }>().notNull(),

    lore:      integer('lore'),
    strength:  integer('strength'),
    willPower: integer('will_power'),
    moveCost:  integer('move_cost'),

    tags: jsonb('tags').$type<string[]>().notNull().default([]),

    category:   jsonb('category').$type<Category>().notNull(),
    legalities: jsonb('legalities').$type<ICard['legalities']>().notNull().default({}),
});

export const CardLocalization = schema.table('card_localizations', {
    cardId: text('card_id').notNull(),
    lang:   locale('lang').notNull(),

    name:     text('loc_name').notNull(),
    typeline: text('loc_typeline').notNull(),
    text:     text('loc_text').notNull(),

    __lastDate:    text('last_date').notNull(),
    __lockedPaths: text('card_localization_locked_paths').array().notNull().default([]),
    __updations:   jsonb('card_localization_updations').$type<Updation[]>().notNull().default([]),
});

export const CardView = schema.view('card_view').as(qb => {
    return qb.select({
        cardId: Card.cardId,
        lang:   CardLocalization.lang,

        ..._.omit(getTableColumns(Card), ['cardId', '__lockedPaths', '__updations']),

        localization: {
            ..._.omit(getTableColumns(CardLocalization), ['cardId', 'lang', '__lockedPaths', '__updations']),
        },
    })
        .from(Card)
        .innerJoin(CardLocalization, eq(CardLocalization.cardId, Card.cardId));
});
