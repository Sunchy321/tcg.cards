import { integer, primaryKey, text, timestamp, bytea } from 'drizzle-orm/pg-core';
import { and, eq } from 'drizzle-orm';

import { schema } from './schema';

// ========== Legacy Tables ==========

export const RuleItem = schema.table('rule_items', {
  date:   text('date').notNull(),
  lang:   text('lang').notNull(),
  itemId: text('item_id').notNull(),

  index: integer('index').notNull(),
  depth: integer('depth').notNull(),

  serial:   text('serial'),
  text:     text('text').notNull(),
  richText: text('rich_text').notNull(),
}, table => [
  primaryKey({ columns: [table.date, table.lang, table.itemId] }),
]);

export const Rule = schema.table('rules', {
  date: text('date').notNull(),
  lang: text('lang').notNull(),
}, table => [
  primaryKey({ columns: [table.date, table.lang] }),
]);

export const ruleView = schema.view('rule_view').as(qb => {
  return qb.select({
    date:   Rule.date,
    lang:   Rule.lang,
    itemId: RuleItem.itemId,

    index: RuleItem.index,
    depth: RuleItem.depth,

    text:     RuleItem.text,
    richText: RuleItem.richText,
  })
    .from(Rule)
    .leftJoin(RuleItem, and(
      eq(Rule.date, RuleItem.date),
      eq(Rule.lang, RuleItem.lang),
    ));
});

// ========== Rule History Tables ==========

// RuleSource: Rule version/source
export const RuleSource = schema.table('rule_source', {
  id:            text('id').primaryKey(),
  effectiveDate: text('effective_date'),
  publishedAt:   text('published_at'),
  txtUrl:        text('txt_url'),
  pdfUrl:        text('pdf_url'),
  docxUrl:       text('docx_url'),
  totalRules:    integer('total_rules'),
  importedAt:    timestamp('imported_at').defaultNow(),
  status:        text('status').notNull().default('active'),
});

// RuleContent: Content-addressed storage
export const RuleContent = schema.table('rule_content', {
  hash:     text('hash').primaryKey(), // sha256
  content:  bytea('content').notNull(), // gzip compressed
  size:     integer('size').notNull(), // original size in bytes
  refCount: integer('ref_count').default(1).notNull(), // reference count for GC
});

// RuleEntity: Cross-version entity tracking
export const RuleEntity = schema.table('rule_entity', {
  id: text('id').primaryKey(), // semantic ID: "{firstVersion}-{firstRuleId}"

  // current state (updated with each version)
  currentNodeId:   text('current_node_id'), // e.g., "20240328/702.1"
  currentRuleId:   text('current_rule_id'), // current official ID
  currentSourceId: text('current_source_id'), // current version

  // stats
  totalRevisions: integer('total_revisions').default(1).notNull(),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

// RuleNode: Rule node within a specific version
export const RuleNode = schema.table('rule_node', {
  // Composite ID: "{sourceId}/{ruleId}" e.g., "20240328/702.1"
  id: text('id').primaryKey(),

  // Foreign keys
  sourceId: text('source_id').notNull().references(() => RuleSource.id),
  ruleId:   text('rule_id').notNull(), // Official ID, e.g., "702.1"

  // Hierarchy (Materialized Path)
  path:     text('path').notNull(), // e.g., "702/1" for sorting and range queries
  level:    integer('level').notNull(), // 0=chapter, 1=rule, 2=subrule
  parentId: text('parent_id'), // Parent node ID, e.g., "20240328/702"

  // Content
  title:       text('title'), // Chapter title (e.g., "Keyword Abilities")
  contentHash: text('content_hash').notNull().references(() => RuleContent.hash),

  // Entity reference
  entityId: text('entity_id').notNull().references(() => RuleEntity.id),
});

// RuleChange: Change records between versions
export const RuleChange = schema.table('rule_change', {
  id: text('id').primaryKey(), // UUID

  // Version range
  fromSourceId: text('from_source_id').notNull().references(() => RuleSource.id),
  toSourceId:   text('to_source_id').notNull().references(() => RuleSource.id),

  // Entity involved
  entityId: text('entity_id').notNull().references(() => RuleEntity.id),

  // Node references (nullable for add/remove)
  fromNodeId: text('from_node_id').references(() => RuleNode.id),
  toNodeId:   text('to_node_id').references(() => RuleNode.id),

  // Change type
  type: text('type').notNull(),
  // 'added' | 'removed' | 'modified' | 'renamed' | 'renamed_modified' | 'moved' | 'split' | 'merged'

  // Details stored as JSON
  details: text('details').notNull(), // JSON string

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
