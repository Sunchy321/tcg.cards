import { boolean, integer, primaryKey, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import _ from 'lodash';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';

import * as basicModel from '@model/hearthstone/schema/basic';
import * as entityModel from '@model/hearthstone/schema/entity';
import { Card } from './card';

export const locale = schema.enum('locale', basicModel.locale.enum);
export const classes = schema.enum('class', basicModel.classes.enum);
export const types = schema.enum('type', basicModel.types.enum);
export const rune = schema.enum('rune', entityModel.rune.enum);
export const race = schema.enum('race', basicModel.race.enum);
export const spellSchool = schema.enum('spell_school', basicModel.spellSchool.enum);
export const rarity = schema.enum('rarity', basicModel.rarity.enum);
export const questType = schema.enum('quest_type', entityModel.questType.enum);
export const mercenaryRole = schema.enum('mercenary_role', entityModel.mercenaryRole.enum);
export const mercenaryFaction = schema.enum('mercenary_faction', entityModel.mercenaryFaction.enum);
export const faction = schema.enum('faction', entityModel.faction.enum);
// FIXME: drizzle-orm cannot recognize enum start with text. fix after drizzle-orm support it.
export const textBuilderType = schema.enum('card_text_builder_type', entityModel.textBuilderType.enum);
export const changeType = schema.enum('change_type', entityModel.changeType.enum);

export const Entity = schema.table('entities', {
    cardId:  text('card_id').notNull(),
    version: integer('version').array().notNull(),

    dbfId: integer('dbf_id').notNull(),
    slug:  text('slug'),

    set:             text('set').notNull(),
    classes:         classes('class').array().notNull(),
    type:            types('type').notNull(),
    cost:            integer('cost').notNull(),
    attack:          integer('attack'),
    health:          integer('health'),
    durability:      integer('durability'),
    armor:           integer('armor'),
    rune:            rune('rune').array(),
    race:            race('race').array(),
    spellSchool:     spellSchool('spell_school'),
    questType:       questType('quest_type'),
    questProgress:   integer('quest_progress'),
    questPart:       integer('quest_part'),
    heroPower:       text('hero_power'),
    heroicHeroPower: text('heroic_hero_power'),

    techLevel:    integer('tech_level'),
    inBobsTavern: boolean('in_bobs_tavern').notNull().default(false),
    tripleCard:   text('triple_card'),
    raceBucket:   race('race_bucket'),
    coin:         integer('coin'),
    armorBucket:  integer('armor_bucket'),
    buddy:        text('buddy'),
    bannedRace:   text('banned_race'),

    mercenaryRole:    mercenaryRole('mercenary_role'),
    mercenaryFaction: mercenaryFaction('mercenary_faction'),
    colddown:         integer('colddown'),

    collectible: boolean('collectible').notNull(),
    elite:       boolean('elite').notNull(),
    rarity:      rarity('rarity'),

    artist: text('artist').notNull(),

    faction: faction('faction'),

    mechanics:      text('mechanics').array().notNull(),
    referencedTags: text('referenced_tags').array().notNull(),
    entourages:     text('entourages').array(),

    deckOrder:         integer('deck_order'),
    overrideWatermark: text('override_watermark'),
    deckSize:          integer('deck_size'),
    localizationNotes: text('localization_notes'),

    textBuilderType: textBuilderType('text_builder_type').notNull().default('default'),

    changeType: changeType('change_type').notNull().default('unknown'),
    isLatest:   boolean('is_latest').notNull().default(false),
}, table => [
    primaryKey({ columns: [table.cardId, table.version] }),
]);

export const EntityLocalization = schema.table('entity_localizations', {
    cardId:  text('card_id').notNull(),
    version: integer('version').array().notNull(),
    lang:    locale('lang').notNull(),

    name:            text('name').notNull(),
    text:            text('text').notNull(),
    richText:        text('rich_text').notNull(),
    displayText:     text('display_text').notNull(),
    targetText:      text('target_text'),
    textInPlay:      text('text_in_play'),
    howToEarn:       text('how_to_earn'),
    howToEarnGolden: text('how_to_earn_golden'),
    flavorText:      text('flavor_text'),

    locChangeType: changeType('loc_change_type').notNull().default('unknown'),
}, table => [
    primaryKey({ columns: [table.cardId, table.version, table.lang] }),
]);

export const EntityView = schema.view('entity_view').as(qb => {
    return qb.select({
        cardId:  Entity.cardId,
        version: sql<number[]>`${Entity.version} & ${EntityLocalization.version}`.as('version'),
        lang:    EntityLocalization.lang,

        ..._.omit(getTableColumns(Entity), ['cardId', 'version']),

        localization: {
            ..._.omit(getTableColumns(EntityLocalization), ['cardId', 'version', 'lang']),
        },
    })
        .from(Entity)
        .innerJoin(EntityLocalization, and(
            eq(Entity.cardId, EntityLocalization.cardId),
            sql`${Entity.version} && ${EntityLocalization.version}`,
        ));
});

export const CardEntityView = schema.view('card_entity_view').as(qb => {
    return qb.select({
        cardId:  Entity.cardId,
        version: sql<number[]>`${Entity.version} & ${EntityLocalization.version}`.as('version'),
        lang:    EntityLocalization.lang,

        ..._.omit(getTableColumns(Entity), ['cardId', 'version']),

        localization: {
            ..._.omit(getTableColumns(EntityLocalization), ['cardId', 'version', 'lang']),
        },

        legalities: Card.legalities,
    })
        .from(Entity)
        .innerJoin(EntityLocalization, and(
            eq(Entity.cardId, EntityLocalization.cardId),
            sql`${Entity.version} && ${EntityLocalization.version}`,
        ))
        .innerJoin(Card, eq(Entity.cardId, Card.cardId));
});
