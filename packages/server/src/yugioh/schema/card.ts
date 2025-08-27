import { integer, jsonb, primaryKey, text } from 'drizzle-orm/pg-core';
import { eq, getTableColumns } from 'drizzle-orm';

import { schema } from './schema';

import _ from 'lodash';

import { Updation } from '@model/basic';

import * as basicModel from '@model/yugioh/schema/basic';
import * as cardModel from '@model/yugioh/schema/card';

export const fullLocale = schema.enum('full_locale', basicModel.fullLocale.enum);
export const attribute = schema.enum('attribute', basicModel.attribute.enum);
export const category = schema.enum('category', cardModel.category.enum);

export const Card = schema.table('cards', {
    cardId: text('card_id').primaryKey().notNull(),

    typeMain: text('type_main').notNull(),
    typeSub:  text('type_sub').array(),

    attribute:          attribute('attribute'),
    level:              integer('level'),
    rank:               integer('rank'),
    linkValue:          integer('link_value'),
    linkMarkers:        text('link_markers').array(),
    attack:             text('attack'),
    defense:            text('defense'),
    race:               text('race'),
    leftPendulumScale:  integer('left_pendulum_scale'),
    rightPendulumScale: integer('right_pendulum_scale'),

    tags: text('tags').array().notNull().default([]),

    category:   category('category').notNull(),
    legalities: jsonb('legalities').notNull().default({}),

    konamiId: integer('konami_id'),
    passcode: integer('passcode'),

    __lockedPaths: text('card_locked_paths').array().notNull().default([]),
    __updations:   jsonb('card_updations').$type<Updation[]>().notNull().default([]),
});

export const CardLocalization = schema.table('card_localizations', {
    cardId: text('card_id').notNull(),
    lang:   fullLocale('lang').notNull(),

    name:     text('name').notNull(),
    rubyName: text('ruby_name'),
    typeline: text('typeline').notNull(),
    text:     text('text').notNull(),
    comment:  text('comment'),

    __lastDate:    text('last_date').notNull(),
    __lockedPaths: text('card_localization_locked_paths').array().notNull().default([]),
    __updations:   jsonb('card_localization_updations').$type<Updation[]>().notNull().default([]),
}, table => [
    primaryKey({ columns: [table.cardId, table.lang] }),
]);

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
