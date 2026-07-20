import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { schema } from './schema';

import { omit } from 'lodash-es';
import { and, eq, getColumns, sql } from 'drizzle-orm';

import * as basicModel from '#model/hearthstone/schema/basic';
import * as entityModel from '#model/hearthstone/schema/entity';

import { BaseCard } from './card';

type IEntity = entityModel.Entity;
type IRenderModel = entityModel.RenderModel;

export const locale = schema.enum('locale', basicModel.locale.enum);
export const changeType = schema.enum('change_type', entityModel.changeType.enum);

export const BaseEntity = schema.table('entities', {
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

  artist:            text('artist').notNull(),
  overrideWatermark: text('override_watermark'),

  // Extrapolated from newer unpack builds — may not be accurate for older cards.
  signatureArtist:  text('signature_artist'),
  creditsCardName:  text('credits_card_name'),
  suggestionWeight: integer('suggestion_weight'),
  changeVersion:    integer('change_version'),

  faction: text('faction').$type<NonNullable<IEntity['faction']>>(),

  mechanics:      jsonb('mechanics').$type<IEntity['mechanics']>().notNull().default({}),
  referencedTags: jsonb('referenced_tags').$type<IEntity['referencedTags']>().notNull().default({}),

  textBuilderType: text('text_builder_type').$type<IEntity['textBuilderType']>().notNull().default('default'),

  changeType: changeType('change_type').notNull().default('unknown'),
  isLatest:   boolean('is_latest').notNull().default(false),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.revisionHash] }),
  index('entities_latest_idx').on(table.isLatest).where(sql`${table.deletedAt} is null`),
  index('entities_version_gin_idx').using('gin', table.version).where(sql`${table.deletedAt} is null`),
  index('entities_deleted_at_idx').on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
  check('entities_version_nonempty_chk', sql`cardinality(${table.version}) > 0`),
]);

export const BaseEntityLocalization = schema.table('entity_localizations', {
  cardId:  text('card_id').notNull(),
  version: integer('version').array().notNull(),
  lang:    locale('lang').notNull(),

  revisionHash:     text('revision_hash').notNull(),
  localizationHash: text('localization_hash').notNull(),
  renderHash:       text('render_hash'),
  renderModel:      jsonb('render_model').$type<IRenderModel>(),
  isLatest:         boolean('is_latest').notNull().default(false),

  name:               text('name').notNull(),
  text:               text('text').notNull(),
  richText:           text('rich_text').notNull(),
  displayText:        text('display_text').notNull(),
  targetText:         text('target_text'),
  textInPlay:         text('text_in_play'),
  howToEarn:          text('how_to_earn'),
  howToEarnGolden:    text('how_to_earn_golden'),
  // Extrapolated from newer unpack builds.
  howToEarnSignature: text('how_to_earn_signature'),
  howToEarnDiamond:   text('how_to_earn_diamond'),
  flavorText:         text('flavor_text'),

  locChangeType: changeType('loc_change_type').notNull().default('unknown'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({ columns: [table.cardId, table.lang, table.revisionHash, table.localizationHash] }),
  index('entity_localizations_card_lang_idx').on(table.cardId, table.lang).where(sql`${table.deletedAt} is null`),
  index('entity_localizations_latest_idx').on(table.isLatest).where(sql`${table.deletedAt} is null`),
  index('entity_localizations_version_gin_idx').using('gin', table.version).where(sql`${table.deletedAt} is null`),
  index('entity_localizations_render_hash_idx')
    .on(table.renderHash)
    .where(and(sql`${table.renderHash} is not null`, sql`${table.deletedAt} is null`)!),
  index('entity_localizations_deleted_at_idx').on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
  check('entity_localizations_version_nonempty_chk', sql`cardinality(${table.version}) > 0`),
]);

export const Entity = schema.view('active_entities').as(qb =>
  qb.select({ ...getColumns(BaseEntity) })
    .from(BaseEntity)
    .where(sql`${BaseEntity.deletedAt} is null`),
);
export const EntityLocalization = schema.view('active_entity_localizations').as(qb =>
  qb.select({ ...getColumns(BaseEntityLocalization) })
    .from(BaseEntityLocalization)
    .where(sql`${BaseEntityLocalization.deletedAt} is null`),
);

export const EntityView = schema.view('entity_view').as(qb =>
  qb.select({
    cardId:  BaseEntity.cardId,
    version: sql<number[]>`${BaseEntity.version} & ${BaseEntityLocalization.version}`.as('version'),
    lang:    BaseEntityLocalization.lang,
    ...omit(getColumns(BaseEntity), [
      'cardId',
      'version',
      'revisionHash',
      'createdAt',
      'updatedAt',
    ]),

    localization: {
      ...omit(getColumns(BaseEntityLocalization), [
        'cardId',
        'version',
        'lang',
        'revisionHash',
        'localizationHash',
        'renderHash',
        'renderModel',
        'isLatest',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ]),
    },
  })
    .from(BaseEntity)
    .innerJoin(BaseEntityLocalization, and(
      eq(BaseEntity.cardId, BaseEntityLocalization.cardId),
      eq(BaseEntity.revisionHash, BaseEntityLocalization.revisionHash),
      sql`${BaseEntity.version} && ${BaseEntityLocalization.version}`,
    ))
    .where(sql`${BaseEntity.deletedAt} is null and ${BaseEntityLocalization.deletedAt} is null`),
);

export const CardEntityView = schema.view('card_entity_view').as(qb =>
  qb.select({
    cardId:           BaseEntity.cardId,
    version:          sql<number[]>`${BaseEntity.version} & ${BaseEntityLocalization.version}`.as('version'),
    lang:             BaseEntityLocalization.lang,
    revisionHash:     BaseEntity.revisionHash,
    localizationHash: BaseEntityLocalization.localizationHash,
    renderHash:       BaseEntityLocalization.renderHash,

    ...omit(getColumns(BaseEntity), [
      'cardId',
      'version',
      'revisionHash',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ]),

    localization: {
      ...omit(getColumns(BaseEntityLocalization), [
        'cardId',
        'version',
        'lang',
        'revisionHash',
        'localizationHash',
        'renderHash',
        'renderModel',
        'isLatest',
        'createdAt',
        'updatedAt',
        'deletedAt',
      ]),
    },

    legalities: BaseCard.legalities,
  })
    .from(BaseEntity)
    .innerJoin(BaseEntityLocalization, and(
      eq(BaseEntity.cardId, BaseEntityLocalization.cardId),
      eq(BaseEntity.revisionHash, BaseEntityLocalization.revisionHash),
      sql`${BaseEntity.version} && ${BaseEntityLocalization.version}`,
    ))
    .innerJoin(BaseCard, eq(BaseEntity.cardId, BaseCard.cardId))
    .where(sql`${BaseEntity.deletedAt} is null and ${BaseEntityLocalization.deletedAt} is null`),
);
