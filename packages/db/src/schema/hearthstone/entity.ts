import {
  boolean,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { omit } from 'lodash-es';
import { and, eq, getColumns, sql } from 'drizzle-orm';

import * as basicModel from '#model/hearthstone/schema/basic';
import * as entityModel from '#model/hearthstone/schema/entity';

import { Card } from './card';

type JsonMap = Record<string, unknown>;
type IEntity = entityModel.Entity;

export const locale = schema.enum('locale', basicModel.locale.enum);
export const changeType = schema.enum('change_type', entityModel.changeType.enum);

export const Entity = schema.table('entities', {
  cardId:  text('card_id').notNull(),
  version: integer('version').array().notNull(),

  revisionHash: text('revision_hash').notNull(),

  dbfId:         integer('dbf_id').notNull(),
  legacyPayload: jsonb('legacy_payload').$type<IEntity['legacyPayload']>().notNull().default({}),

  set:           text('set').notNull(),
  classes:       text('class').array().$type<IEntity['classes'][number]>().notNull(),
  type:          text('type').$type<IEntity['type']>().notNull(),
  cost:          integer('cost').notNull(),
  attack:        integer('attack'),
  health:        integer('health'),
  durability:    integer('durability'),
  armor:         integer('armor'),
  rune:          text('rune').array().$type<NonNullable<IEntity['rune']>[number]>(),
  race:          text('race').array().$type<NonNullable<IEntity['race']>[number]>(),
  spellSchool:   text('spell_school').$type<NonNullable<IEntity['spellSchool']>>(),
  questType:     text('quest_type').$type<NonNullable<IEntity['questType']>>(),
  questProgress: integer('quest_progress'),
  questPart:     integer('quest_part'),
  heroPower:     text('hero_power'),

  techLevel:    integer('tech_level'),
  inBobsTavern: boolean('in_bobs_tavern').notNull().default(false),
  tripleCard:   text('triple_card'),
  raceBucket:   text('race_bucket').$type<NonNullable<IEntity['raceBucket']>>(),
  armorBucket:  integer('armor_bucket'),
  buddy:        text('buddy'),
  bannedRace:   text('banned_race'),

  mercenaryRole:    text('mercenary_role').$type<NonNullable<IEntity['mercenaryRole']>>(),
  mercenaryFaction: text('mercenary_faction').$type<NonNullable<IEntity['mercenaryFaction']>>(),
  colddown:         integer('colddown'),

  collectible: boolean('collectible').notNull(),
  elite:       boolean('elite').notNull(),
  rarity:      text('rarity').$type<NonNullable<IEntity['rarity']>>(),

  artist: text('artist').notNull(),

  faction: text('faction').$type<NonNullable<IEntity['faction']>>(),

  mechanics:      jsonb('mechanics').$type<IEntity['mechanics']>().notNull().default({}),
  referencedTags: text('referenced_tags').array().$type<IEntity['referencedTags'][number]>().notNull(),

  textBuilderType: text('text_builder_type').$type<IEntity['textBuilderType']>().notNull().default('default'),

  changeType: changeType('change_type').notNull().default('unknown'),
  isLatest:   boolean('is_latest').notNull().default(false),
}, table => [
  primaryKey({ columns: [table.cardId, table.revisionHash] }),
]);

export const EntityLocalization = schema.table('entity_localizations', {
  cardId:  text('card_id').notNull(),
  version: integer('version').array().notNull(),
  lang:    locale('lang').notNull(),

  revisionHash:     text('revision_hash').notNull(),
  localizationHash: text('localization_hash').notNull(),
  renderHash:       text('render_hash'),
  renderModel:      jsonb('render_model').$type<JsonMap>(),
  isLatest:         boolean('is_latest').notNull().default(false),

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
  primaryKey({ columns: [table.cardId, table.lang, table.revisionHash, table.localizationHash] }),
  index('entity_localizations_render_hash_idx')
    .on(table.renderHash)
    .where(sql`${table.renderHash} is not null`),
]);

export const EntityView = schema.view('entity_view').as(qb => {
  return qb.select({
    cardId:  Entity.cardId,
    version: sql<number[]>`${Entity.version} & ${EntityLocalization.version}`.as('version'),
    lang:    EntityLocalization.lang,

    ...omit(getColumns(Entity), [
      'cardId',
      'version',
      'revisionHash',
    ]),

    localization: {
      ...omit(getColumns(EntityLocalization), [
        'cardId',
        'version',
        'lang',
        'revisionHash',
        'localizationHash',
        'renderHash',
        'renderModel',
        'isLatest',
      ]),
    },
  })
    .from(Entity)
    .innerJoin(EntityLocalization, and(
      eq(Entity.cardId, EntityLocalization.cardId),
      eq(Entity.revisionHash, EntityLocalization.revisionHash),
      sql`${Entity.version} && ${EntityLocalization.version}`,
    ));
});

export const CardEntityView = schema.view('card_entity_view').as(qb => {
  return qb.select({
    cardId:           Entity.cardId,
    version:          sql<number[]>`${Entity.version} & ${EntityLocalization.version}`.as('version'),
    lang:             EntityLocalization.lang,
    revisionHash:     Entity.revisionHash,
    localizationHash: EntityLocalization.localizationHash,
    renderHash:       EntityLocalization.renderHash,

    ...omit(getColumns(Entity), [
      'cardId',
      'version',
      'revisionHash',
    ]),

    localization: {
      ...omit(getColumns(EntityLocalization), [
        'cardId',
        'version',
        'lang',
        'revisionHash',
        'localizationHash',
        'renderHash',
        'renderModel',
        'isLatest',
      ]),
    },

    legalities: Card.legalities,
  })
    .from(Entity)
    .innerJoin(EntityLocalization, and(
      eq(Entity.cardId, EntityLocalization.cardId),
      eq(Entity.revisionHash, EntityLocalization.revisionHash),
      sql`${Entity.version} && ${EntityLocalization.version}`,
    ))
    .innerJoin(Card, eq(Entity.cardId, Card.cardId));
});
