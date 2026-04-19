import {
  boolean,
  index,
  integer,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core';

import { schema } from './schema';

export const EntityRelation = schema.table('entity_relations', {
  sourceId:           text('source_id').notNull(),
  sourceRevisionHash: text('source_revision_hash').notNull(),
  relation:           text('relation').notNull(),
  targetId:           text('target_id').notNull(),
  version:            integer('version').array().notNull(),
  isLatest:           boolean('is_latest').notNull().default(false),
}, table => [
  primaryKey({
    columns: [
      table.sourceId,
      table.sourceRevisionHash,
      table.relation,
      table.targetId,
    ],
  }),
  index('entity_relations_source_idx').on(table.sourceId),
  index('entity_relations_target_idx').on(table.targetId),
  index('entity_relations_source_relation_idx').on(table.sourceId, table.relation),
  index('entity_relations_target_relation_idx').on(table.targetId, table.relation),
  index('entity_relations_latest_idx').on(table.isLatest),
]);
