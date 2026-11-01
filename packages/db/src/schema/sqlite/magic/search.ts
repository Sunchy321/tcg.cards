import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

/** Exportable Magic search-domain projection ({magic}); it contains no user state. */
export const SearchMeta = sqliteTable('magic_search_meta', {
  key:   text('key').notNull(),
  value: text('value').notNull(),
}, table => [
  primaryKey({ columns: [table.key] }),
]);

/** Stores one card-level Magic search row per source revision. */
export const SearchCard = sqliteTable('magic_search_cards', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull(),
  ambit:     text('ambit').notNull(),
  manaValue: real('mana_value').notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.version] }),
]);

/** Stores single-valued facts that belong to one card part. */
export const SearchCardPart = sqliteTable('magic_search_card_parts', {
  cardId:       text('card_id').notNull(),
  version:      text('version').notNull(),
  partIndex:    integer('part_index').notNull(),
  name:         text('name').notNull(),
  typeline:     text('typeline').notNull(),
  power:        text('power'),
  toughness:    text('toughness'),
  loyalty:      text('loyalty'),
  defense:      text('defense'),
  handModifier: text('hand_modifier'),
  lifeModifier: text('life_modifier'),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.partIndex] }),
  foreignKey({
    columns:        [table.cardId, table.version],
    foreignColumns: [SearchCard.cardId, SearchCard.version],
  }),
]);

/** Stores localized names and typelines for each card-part source. */
export const SearchCardPartLocalization = sqliteTable('magic_search_card_part_localizations', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull(),
  locale:    text('locale').notNull(),
  source:    text('source').notNull(),
  partIndex: integer('part_index').notNull(),
  name:      text('name').notNull(),
  rubyName:  text('ruby_name'),
  typeline:  text('typeline').notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.locale, table.source, table.partIndex] }),
  foreignKey({
    columns:        [table.cardId, table.version, table.partIndex],
    foreignColumns: [SearchCardPart.cardId, SearchCardPart.version, SearchCardPart.partIndex],
  }),
]);

/** Stores multi-valued card facts as one row per field value. */
export const SearchCardValue = sqliteTable('magic_search_card_values', {
  cardId:  text('card_id').notNull(),
  version: text('version').notNull(),
  field:   text('field').notNull(),
  value:   text('value').notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.field, table.value] }),
  foreignKey({
    columns:        [table.cardId, table.version],
    foreignColumns: [SearchCard.cardId, SearchCard.version],
  }),
]);

/** Stores multi-valued part facts as one row per field value. */
export const SearchCardPartValue = sqliteTable('magic_search_part_values', {
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull(),
  partIndex: integer('part_index').notNull(),
  field:     text('field').notNull(),
  value:     text('value').notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.partIndex, table.field, table.value] }),
  foreignKey({
    columns:        [table.cardId, table.version, table.partIndex],
    foreignColumns: [SearchCardPart.cardId, SearchCardPart.version, SearchCardPart.partIndex],
  }),
]);

/** Stores the display candidate selected for each requested locale. */
export const SearchCardCandidate = sqliteTable('magic_search_candidates', {
  cardId:        text('card_id').notNull(),
  version:       text('version').notNull(),
  requestLocale: text('request_locale').notNull(),
  setCode:       text('set_code').notNull(),
  number:        text('number').notNull(),
  printLang:     text('print_lang').notNull(),
  printSource:   text('print_source').notNull(),
  releaseDate:   text('release_date').notNull(),
  layout:        text('layout').notNull(),
  imageType:     text('image_type').notNull(),
  imageStatus:   text('image_status').notNull(),
}, table => [
  primaryKey({ columns: [table.cardId, table.version, table.requestLocale] }),
  foreignKey({
    columns:        [table.cardId, table.version],
    foreignColumns: [SearchCard.cardId, SearchCard.version],
  }),
]);

/** Stores each searchable body independently from other fields and locales. */
export const SearchTextRow = sqliteTable('magic_search_text_rows', {
  textId:    integer('text_id').primaryKey(),
  kind:      text('kind').notNull(),
  cardId:    text('card_id').notNull(),
  version:   text('version').notNull(),
  partIndex: integer('part_index').notNull(),
  locale:    text('locale'),
  source:    text('source'),
  body:      text('body').notNull(),
}, table => [
  check('magic_search_text_rows_kind_check', sql`${table.kind} IN ('part', 'localization')`),
  check(
    'magic_search_text_rows_identity_check',
    sql`(${table.kind} = 'part' AND ${table.locale} IS NULL AND ${table.source} IS NULL)
      OR (${table.kind} = 'localization' AND ${table.locale} IS NOT NULL AND ${table.source} IS NOT NULL)`,
  ),
  foreignKey({
    columns:        [table.cardId, table.version, table.partIndex],
    foreignColumns: [SearchCardPart.cardId, SearchCardPart.version, SearchCardPart.partIndex],
  }),
]);
