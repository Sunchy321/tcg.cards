import { boolean, integer, primaryKey, text } from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { omit } from 'lodash';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';

export const EntityLocalization = schema.table('entity_localizations', {
    cardId:  text('card_id').notNull(),
    version: integer('version').array().notNull(),
    lang:    text('lang').notNull(),

    name:            text('name'),
    text:            text('text').notNull(),
    displayText:     text('display_text').notNull(),
    richText:        text('rich_text').notNull(),
    targetText:      text('target_text'),
    textInPlay:      text('text_in_play'),
    howToEarn:       text('how_to_earn'),
    howToEarnGolden: text('how_to_earn_golden'),
    flavorText:      text('flavor_text'),
}, table => [
    primaryKey({ columns: [table.cardId, table.version, table.lang] }),
]);

export const Entity = schema.table('entities', {
    cardId:  text('card_id').notNull(),
    version: integer('version').array().notNull(),

    set:           text('set').notNull(),
    classes:       text('class').array().notNull(),
    type:          text('type').notNull(),
    cost:          integer('cost').notNull(),
    attack:        integer('attack'),
    health:        integer('health'),
    durability:    integer('durability'),
    armor:         integer('armor'),
    rune:          text('rune').array(),
    race:          text('race').array(),
    spellSchool:   text('spell_school'),
    questType:     text('quest_type'),
    questProgress: integer('quest_progress'),
    questPart:     integer('quest_part'),

    techLevel:    integer('tech_level'),
    inBobsTavern: boolean('in_bobs_tavern').default(false),
    tripleCard:   text('triple_card'),
    raceBucket:   text('race_bucket'),
    coin:         integer('coin'),
    armorBucket:  integer('armor_bucket'),
    buddy:        text('buddy'),
    bannedRace:   text('banned_race'),

    mercenaryRole:    text('mercenary_role'),
    mercenaryFaction: text('mercenary_faction'),
    colddown:         integer('colddown'),

    collectible: boolean('collectible'),
    elite:       boolean('elite'),
    rarity:      text('rarity'),

    artist: text('artist'),

    faction: text('faction'),

    mechanics:      text('mechanics').array(),
    referencedTags: text('referenced_tags').array(),

    entourages:      text('entourages').array(),
    heroPower:       text('hero_power'),
    heroicHeroPower: text('heroic_hero_power'),

    deckOrder:         integer('deck_order'),
    overrideWatermark: text('override_watermark'),
    deckSize:          integer('deck_size'),
    localizationNotes: text('localization_notes'),

    isCurrent: boolean('is_current').default(false),
}, table => [
    primaryKey({ columns: [table.cardId, table.version] }),
]);

export const EntityView = schema.view('entity_view').as(qb => {
    return qb.select({
        cardId:  Entity.cardId,
        version: sql`${Entity.version} & ${EntityLocalization.version}`.as('version'),
        lang:    EntityLocalization.lang,

        ...omit(getTableColumns(Entity), ['cardId', 'version']) as any,

        localization: {
            ...omit(getTableColumns(EntityLocalization), ['cardId', 'version', 'lang']),
        },
    })
        .from(Entity)
        .leftJoin(EntityLocalization, and(
            eq(Entity.cardId, EntityLocalization.cardId),
            eq(Entity.version, EntityLocalization.version),
        ));
});
