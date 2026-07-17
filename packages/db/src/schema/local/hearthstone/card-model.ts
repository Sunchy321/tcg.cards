import { eq, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { Patch } from '../../shared/hearthstone/patch';
import { Tag } from '../../shared/hearthstone/tag';
import { dataSchema } from '../../shared/hearthstone/schema';

type JsonMap = Record<string, unknown>;
type LocalizedText = Record<string, string>;
type JsonValue = unknown;

export const hsdataProjectionStatus = dataSchema.enum('hsdata_projection_status', [
  'not_started',
  'processing',
  'completed',
  'failed',
]);

export const hsdataSnapshotProjectionState = dataSchema.enum('hsdata_snapshot_projection_state', [
  'not_projected',
  'version_only',
  'projected',
]);

export const PatchState = dataSchema.table('patch_states', {
  buildNumber: integer('build_number')
    .primaryKey()
    .references(() => Patch.buildNumber),
  commit: text('commit').notNull().default(''),
  uri:    text('uri').notNull().default(''),

  importStatus: text('import_status').notNull().default('pending'),
  importError:  text('import_error'),

  projectionStatus: hsdataProjectionStatus('projection_status').notNull().default('not_started'),
  projectionError:  text('projection_error'),
  importedAt:       timestamp('imported_at'),
  projectedAt:      timestamp('projected_at'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('patch_states_import_status_idx').on(table.importStatus),
  index('patch_states_projection_status_idx').on(table.projectionStatus),
]);

export const RawEntitySnapshot = dataSchema.table('raw_entity_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),

  cardId:           text('card_id').notNull(),
  dbfId:            integer('dbf_id').notNull(),
  sourceTags:       integer('source_tags').array().notNull(),
  entityXmlVersion: integer('entity_xml_version').notNull(),

  snapshotHash: text('snapshot_hash').notNull(),
  extraPayload: jsonb('extra_payload').$type<JsonMap>().notNull().default({}),

  projectionState: hsdataSnapshotProjectionState('projection_state').notNull().default('not_projected'),

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
  index('raw_entity_snapshots_source_tags_gin_idx').using('gin', table.sourceTags),
  index('raw_entity_snapshots_projection_state_idx').on(table.projectionState).where(sql`${table.projectionState} != 'projected'`),
  check('raw_entity_snapshots_source_tags_nonempty_chk', sql`cardinality(${table.sourceTags}) > 0`),
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
  cardValue:      text('card_value'),
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
    .on(table.enumId, table.cardValue)
    .where(sql`${table.cardValue} is not null`),
]);

export const TagValueView = dataSchema.view('tag_value_view').as(qb => {
  return qb
    .select({
      snapshotId:     RawEntitySnapshotTag.snapshotId,
      cardId:         RawEntitySnapshot.cardId,
      dbfId:          RawEntitySnapshot.dbfId,
      sourceTags:     RawEntitySnapshot.sourceTags,
      enumId:         RawEntitySnapshotTag.enumId,
      tagSlug:        sql<string>`${Tag.slug}`.as('tag_slug'),
      tagName:        sql<string | null>`${Tag.name}`.as('tag_name'),
      valueKind:      RawEntitySnapshotTag.valueKind,
      boolValue:      RawEntitySnapshotTag.boolValue,
      intValue:       RawEntitySnapshotTag.intValue,
      stringValue:    RawEntitySnapshotTag.stringValue,
      enumValue:      RawEntitySnapshotTag.enumValue,
      locStringValue: RawEntitySnapshotTag.locStringValue,
      cardValue:      RawEntitySnapshotTag.cardValue,
      jsonValue:      RawEntitySnapshotTag.jsonValue,
    })
    .from(RawEntitySnapshotTag)
    .innerJoin(RawEntitySnapshot, eq(RawEntitySnapshotTag.snapshotId, RawEntitySnapshot.id))
    .innerJoin(Tag, eq(RawEntitySnapshotTag.enumId, Tag.enumId));
});

export const PatchView = dataSchema.view('patch_view').as(qb => {
  return qb
    .select({
      buildNumber:      PatchState.buildNumber,
      name:             Patch.name,
      shortName:        Patch.shortName,
      hash:             Patch.hash,
      isLatest:         Patch.isLatest,
      releaseDate:      Patch.releaseDate,
      expansion:        Patch.expansion,
      commit:           PatchState.commit,
      uri:              PatchState.uri,
      importStatus:     PatchState.importStatus,
      importError:      PatchState.importError,
      importedAt:       PatchState.importedAt,
      projectionStatus: PatchState.projectionStatus,
      projectionError:  PatchState.projectionError,
      projectedAt:      PatchState.projectedAt,
      createdAt:        PatchState.createdAt,
      updatedAt:        PatchState.updatedAt,
    })
    .from(PatchState)
    .innerJoin(Patch, eq(PatchState.buildNumber, Patch.buildNumber));
});
