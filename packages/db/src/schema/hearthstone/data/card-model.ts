import { eq, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { Tag } from '../tag';
import { dataSchema } from '../schema';

type JsonMap = Record<string, unknown>;
type LocalizedText = Record<string, string>;
type JsonValue = unknown;

export const SourceVersion = dataSchema.table('source_versions', {
  sourceTag:    integer('source_tag').primaryKey(),
  sourceCommit: text('source_commit').notNull().default(''),
  build:        integer('build'),
  sourceHash:   text('source_hash').notNull().default(''),
  sourceUri:    text('source_uri').notNull().default(''),
  status:       text('status').notNull().default('pending'),
  importedAt:   timestamp('imported_at'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
  updatedAt:    timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('source_versions_status_idx').on(table.status),
  index('source_versions_build_idx').on(table.build),
  index('source_versions_source_hash_idx').on(table.sourceHash),
]);

export const RawEntitySnapshot = dataSchema.table('raw_entity_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),

  cardId:           text('card_id').notNull(),
  dbfId:            integer('dbf_id').notNull(),
  version:          integer('version').array().notNull(),
  entityXmlVersion: integer('entity_xml_version').notNull(),

  snapshotHash: text('snapshot_hash').notNull(),
  extraPayload: jsonb('extra_payload').$type<JsonMap>().notNull().default({}),

  isLatest: boolean('is_latest').notNull().default(false),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('raw_entity_snapshots_card_hash_uq').on(table.cardId, table.snapshotHash),
  index('raw_entity_snapshots_card_id_idx').on(table.cardId),
  index('raw_entity_snapshots_dbf_id_idx').on(table.dbfId),
  index('raw_entity_snapshots_snapshot_hash_idx').on(table.snapshotHash),
  index('raw_entity_snapshots_latest_idx').on(table.isLatest),
]);

export const RawEntitySnapshotTag = dataSchema.table('raw_entity_snapshot_tags', {
  snapshotId: uuid('snapshot_id')
    .notNull()
    .references(() => RawEntitySnapshot.id, { onDelete: 'cascade' }),
  enumId: integer('enum_id')
    .notNull()
    .references(() => Tag.enumId),
  tagOrder: integer('tag_order').notNull().default(0),

  rawName:    text('raw_name').notNull().default(''),
  rawType:    text('raw_type').notNull().default(''),
  rawPayload: jsonb('raw_payload').$type<JsonMap>().notNull().default({}),

  valueKind:      text('value_kind').notNull().default('json'),
  boolValue:      boolean('bool_value'),
  intValue:       integer('int_value'),
  stringValue:    text('string_value'),
  enumValue:      text('enum_value'),
  locStringValue: jsonb('loc_string_value').$type<LocalizedText>(),
  cardRefCardId:  text('card_ref_card_id'),
  cardRefDbfId:   integer('card_ref_dbf_id'),
  jsonValue:      jsonb('json_value').$type<JsonValue>(),

  parseStatus: text('parse_status').notNull().default('parsed'),
}, table => [
  primaryKey({ columns: [table.snapshotId, table.enumId, table.tagOrder] }),
  index('raw_entity_snapshot_tags_snapshot_idx').on(table.snapshotId),
  index('raw_entity_snapshot_tags_enum_idx').on(table.enumId),
  index('raw_entity_snapshot_tags_enum_int_idx')
    .on(table.enumId, table.intValue)
    .where(sql`${table.intValue} is not null`),
  index('raw_entity_snapshot_tags_enum_bool_idx')
    .on(table.enumId, table.boolValue)
    .where(sql`${table.boolValue} is not null`),
  index('raw_entity_snapshot_tags_enum_string_idx')
    .on(table.enumId, table.stringValue)
    .where(sql`${table.stringValue} is not null`),
  index('raw_entity_snapshot_tags_enum_enum_idx')
    .on(table.enumId, table.enumValue)
    .where(sql`${table.enumValue} is not null`),
  index('raw_entity_snapshot_tags_enum_card_idx')
    .on(table.enumId, table.cardRefCardId)
    .where(sql`${table.cardRefCardId} is not null`),
]);

export const TagValueView = dataSchema.view('tag_value_view').as(qb => {
  return qb
    .select({
      snapshotId:     RawEntitySnapshotTag.snapshotId,
      cardId:         RawEntitySnapshot.cardId,
      dbfId:          RawEntitySnapshot.dbfId,
      version:        RawEntitySnapshot.version,
      enumId:         RawEntitySnapshotTag.enumId,
      tagSlug:        sql<string>`${Tag.slug}`.as('tag_slug'),
      tagName:        sql<string | null>`${Tag.name}`.as('tag_name'),
      valueKind:      RawEntitySnapshotTag.valueKind,
      boolValue:      RawEntitySnapshotTag.boolValue,
      intValue:       RawEntitySnapshotTag.intValue,
      stringValue:    RawEntitySnapshotTag.stringValue,
      enumValue:      RawEntitySnapshotTag.enumValue,
      locStringValue: RawEntitySnapshotTag.locStringValue,
      cardRefCardId:  RawEntitySnapshotTag.cardRefCardId,
      cardRefDbfId:   RawEntitySnapshotTag.cardRefDbfId,
      jsonValue:      RawEntitySnapshotTag.jsonValue,
    })
    .from(RawEntitySnapshotTag)
    .innerJoin(RawEntitySnapshot, eq(RawEntitySnapshotTag.snapshotId, RawEntitySnapshot.id))
    .innerJoin(Tag, eq(RawEntitySnapshotTag.enumId, Tag.enumId));
});
