import { sql } from 'drizzle-orm';
import { type AnyPgColumn, type PgSchema, check, index, integer, primaryKey, text, unique } from 'drizzle-orm/pg-core';
import type { NodeChangeType } from '#model/magic/schema/document';

/** Store derived adjacency separately from exportable source content and retained reviews. */
export function documentRelationTables(schema: PgSchema, documentId: AnyPgColumn, releaseId: AnyPgColumn, revisionId: AnyPgColumn) {
  const DocumentAdjacency = schema.table('document_adjacencies', {
    id:             text('id').primaryKey(),
    documentId:     text('document_id').notNull().references(() => documentId),
    fromReleaseId:  text('from_release_id').notNull().references(() => releaseId),
    toReleaseId:    text('to_release_id').notNull().references(() => releaseId),
    fromRevisionId: text('from_revision_id').notNull().references(() => revisionId),
    toRevisionId:   text('to_revision_id').notNull().references(() => revisionId),
    fromHash:       text('from_hash').notNull(),
    toHash:         text('to_hash').notNull(),
    algorithm:      text('algorithm').notNull(),
    timelineHash:   text('timeline_hash').notNull(),
  }, table => [
    unique('document_adjacencies_pair_uq').on(table.documentId, table.fromReleaseId, table.toReleaseId),
    check('document_adjacencies_distinct_ck', sql`${table.fromReleaseId} <> ${table.toReleaseId}`),
  ]);

  const DocumentNodeRelation = schema.table('document_node_relations', {
    comparisonId: text('comparison_id').notNull().references(() => DocumentAdjacency.id),
    groupId:      text('group_id').notNull(),
    side:         text('side').$type<'from' | 'to'>().notNull(),
    // Derived references deliberately do not block reparsing. Revision hashes
    // invalidate the entire boundary before any retained node reference is read.
    nodeId:       text('node_id').notNull(),
    identity:     text('identity').notNull(),
    itemId:       text('item_id').notNull(),
    kind:         text('kind').$type<NodeChangeType | 'unchanged'>().notNull(),
    position:     integer('position').notNull(),
  }, table => [
    primaryKey({ columns: [table.comparisonId, table.side, table.nodeId] }),
    index('document_node_relations_identity_idx').on(table.identity, table.comparisonId),
    index('document_node_relations_node_idx').on(table.nodeId, table.comparisonId),
    index('document_node_relations_group_idx').on(table.comparisonId, table.groupId),
    check('document_node_relations_side_ck', sql`${table.side} IN ('from', 'to')`),
    check('document_node_relations_kind_ck', sql`${table.kind} IN ('unchanged', 'added', 'removed', 'modified', 'moved', 'renamed', 'renamed_modified', 'split', 'merged')`),
  ]);

  return { DocumentAdjacency, DocumentNodeRelation };
}
