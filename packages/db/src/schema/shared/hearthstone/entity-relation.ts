import {
  boolean,
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { getColumns, sql } from 'drizzle-orm';

import { schema } from './schema';

export const BaseEntityRelation = schema.table('entity_relations', {
  sourceId:           text('source_id').notNull(),
  sourceRevisionHash: text('source_revision_hash').notNull(),
  relation:           text('relation').notNull(),
  targetId:           text('target_id').notNull(),
  version:            integer('version').array().notNull(),
  isLatest:           boolean('is_latest').notNull().default(false),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  deletedAt: timestamp('deleted_at'),
}, table => [
  primaryKey({
    columns: [
      table.sourceId,
      table.sourceRevisionHash,
      table.relation,
      table.targetId,
    ],
  }),
  index('entity_relations_deleted_at_idx').on(table.deletedAt).where(sql`${table.deletedAt} is not null`),
  index('entity_relations_source_idx').on(table.sourceId).where(sql`${table.deletedAt} is null`),
  index('entity_relations_target_idx').on(table.targetId).where(sql`${table.deletedAt} is null`),
  index('entity_relations_source_relation_idx').on(table.sourceId, table.relation).where(sql`${table.deletedAt} is null`),
  index('entity_relations_target_relation_idx').on(table.targetId, table.relation).where(sql`${table.deletedAt} is null`),
  index('entity_relations_latest_idx').on(table.isLatest).where(sql`${table.deletedAt} is null`),
  index('entity_relations_version_gin_idx').using('gin', table.version).where(sql`${table.deletedAt} is null`),
  check('entity_relations_version_nonempty_chk', sql`cardinality(${table.version}) > 0`),
]);

export const EntityRelation = schema.view('active_entity_relations').as(qb =>
  qb.select({ ...getColumns(BaseEntityRelation) })
    .from(BaseEntityRelation)
    .where(sql`${BaseEntityRelation.deletedAt} is null`),
);
