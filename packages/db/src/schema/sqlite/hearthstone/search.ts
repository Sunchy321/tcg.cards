import { foreignKey, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { Entity } from '#model/hearthstone/schema/entity';
import type { Locale } from '#model/hearthstone/schema/basic';
import type { SimpleTags } from '#model/hearthstone/search/manifest';

/** Stores version metadata for an exportable Hearthstone domain snapshot ({hearthstone}). */
export const SearchMeta = sqliteTable(
  'hearthstone_search_meta',
  {
    key:   text('key').notNull(),
    value: text('value').notNull(),
  },
  table => [primaryKey({ columns: [table.key] })],
);

/** Stores latest card scalars and display-only tags; array lengths preserve NULL and empty arrays. */
export const SearchCard = sqliteTable('hearthstone_search_cards', {
  cardId:           text('card_id').primaryKey(),
  set:              text('set').notNull(),
  // PG-derived ranks preserve the source collation without changing display values.
  idOrder:          integer('id_order').notNull(),
  setOrder:         integer('set_order').notNull(),
  type:             text('type').$type<Entity['type']>().notNull(),
  cost:             integer('cost').notNull(),
  attack:           integer('attack'),
  health:           integer('health'),
  durability:       integer('durability'),
  armor:            integer('armor'),
  spellSchool:      text('spell_school').$type<Entity['spellSchool']>(),
  collectible:      integer('collectible', { mode: 'boolean' }).notNull(),
  elite:            integer('elite', { mode: 'boolean' }).notNull(),
  rarity:           text('rarity').$type<Entity['rarity']>(),
  ambit:            text('ambit').$type<Entity['ambit']>().notNull(),
  techLevel:        integer('tech_level'),
  inBobsTavern:     integer('in_bobs_tavern', { mode: 'boolean' }).notNull(),
  mercenaryRole:    text('mercenary_role').$type<Entity['mercenaryRole']>(),
  mercenaryFaction: text('mercenary_faction').$type<Entity['mercenaryFaction']>(),
  colddown:         integer('colddown'),
  classCount:       integer('class_count').notNull(),
  runeCount:        integer('rune_count'),
  raceCount:        integer('race_count'),
  raceBucketCount:  integer('race_bucket_count'),
  // These values only serve list images and never participate in filtering or indexing.
  simpleTags:       text('simple_tags', { mode: 'json' }).$type<SimpleTags>().notNull(),
});

/** Stores one latest name, plain body, and image identity for each card language. */
export const SearchCardLocalization = sqliteTable(
  'hearthstone_search_card_localizations',
  {
    cardId: text('card_id')
      .notNull()
      .references(() => SearchCard.cardId),
    lang:        text('lang').$type<Locale>().notNull(),
    name:        text('name').notNull(),
    nameOrder:   integer('name_order').notNull(),
    text:        text('text').notNull(),
    renderHash:  text('render_hash'),
    searchTerms: text('search_terms', { mode: 'json' }).$type<string[] | null>(),
  },
  table => [primaryKey({ columns: [table.cardId, table.lang] })],
);

/** Preserves array order and duplicates as individual relation rows. */
export const SearchCardValue = sqliteTable(
  'hearthstone_search_card_values',
  {
    cardId: text('card_id')
      .notNull()
      .references(() => SearchCard.cardId),
    field:    text('field').$type<'classes' | 'rune' | 'race' | 'raceBucket'>().notNull(),
    position: integer('position').notNull(),
    value:    text('value').notNull(),
  },
  table => [primaryKey({ columns: [table.cardId, table.field, table.position] })],
);

/** Stores each format status without querying JSON documents. */
export const SearchCardLegality = sqliteTable(
  'hearthstone_search_card_legalities',
  {
    cardId: text('card_id')
      .notNull()
      .references(() => SearchCard.cardId),
    format: text('format').notNull(),
    status: text('status').notNull(),
  },
  table => [primaryKey({ columns: [table.cardId, table.format] })],
);

/** Provides stable FTS row identities without joining or concatenating different languages. */
export const SearchTextRow = sqliteTable(
  'hearthstone_search_text_rows',
  {
    textId: integer('text_id').primaryKey(),
    cardId: text('card_id').notNull(),
    lang:   text('lang').$type<Locale>().notNull(),
    body:   text('body').notNull(),
  },
  table => [
    foreignKey({
      columns:        [table.cardId, table.lang],
      foreignColumns: [SearchCardLocalization.cardId, SearchCardLocalization.lang],
    }),
  ],
);
