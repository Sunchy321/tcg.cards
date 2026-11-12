import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import type { Entity } from '#model/hearthstone/schema/entity';
import type { SimpleTags } from '#model/hearthstone/search/manifest';

import { ambit } from '../ambit';
import { locale } from './entity';
import { schema } from './schema';

export const SearchCard = schema.table('search_cards', {
  cardId:           text('card_id').primaryKey(),
  set:              text('set').notNull(),
  classes:          text('class').array().$type<Entity['classes'][number]>().notNull(),
  type:             text('type').$type<Entity['type']>().notNull(),
  cost:             integer('cost').notNull(),
  attack:           integer('attack'),
  health:           integer('health'),
  durability:       integer('durability'),
  armor:            integer('armor'),
  rune:             text('rune').array().$type<NonNullable<Entity['rune']>[number]>(),
  race:             text('race').array().$type<NonNullable<Entity['race']>[number]>(),
  spellSchool:      text('spell_school').$type<Entity['spellSchool']>(),
  collectible:      boolean('collectible').notNull(),
  elite:            boolean('elite').notNull(),
  rarity:           text('rarity').$type<Entity['rarity']>(),
  ambit:            ambit('ambit').notNull(),
  legalities:       jsonb('legalities').$type<Record<string, string>>().notNull(),
  techLevel:        integer('tech_level'),
  inBobsTavern:     boolean('in_bobs_tavern').notNull(),
  raceBucket:       text('race_bucket').array().$type<NonNullable<Entity['raceBucket']>[number]>(),
  mercenaryRole:    text('mercenary_role').$type<Entity['mercenaryRole']>(),
  mercenaryFaction: text('mercenary_faction').$type<Entity['mercenaryFaction']>(),
  colddown:         integer('colddown'),
  simpleTags:       jsonb('simple_tags').$type<SimpleTags>().notNull().default({}),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  deletedAt:        timestamp('deleted_at'),
}, table => [
  index('search_cards_cost_idx').on(table.cost),
  index('search_cards_class_gin_idx').using('gin', table.classes),
  index('search_cards_in_tavern_idx').on(table.cardId).where(sql`${table.inBobsTavern}`),
]);

export const SearchCardLocalization = schema.table('search_card_localizations', {
  cardId:      text('card_id').notNull(),
  lang:        locale('lang').notNull(),
  name:        text('name').notNull(),
  text:        text('text').notNull(),
  renderHash:  text('render_hash'),
  searchTerms: text('search_terms').array(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
  updatedAt:   timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  deletedAt:   timestamp('deleted_at'),
}, table => [primaryKey({ columns: [table.cardId, table.lang] })]);
