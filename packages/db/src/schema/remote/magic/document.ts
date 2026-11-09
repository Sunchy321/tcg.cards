import { sql } from 'drizzle-orm';
import { boolean, foreignKey, index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import type { ChangeReviewOverridePayload, NodeChangeDetails, NodeChangeType } from '#model/magic/schema/document';
import { changeReviewStatus as modelChangeReviewStatus } from '#model/magic/schema/document';

import { appSchema } from '../../shared/magic/schema';
import { users } from '../auth';
import { Document, DocumentRelease, DocumentRevision } from './documents';

/** Cache a deterministic comparison against immutable source revisions. */
export interface StoredDocumentChange {
  id:              string;
  entityId:        string | null;
  fromNodeRefId:   string | null;
  toNodeRefId:     string | null;
  type:            NodeChangeType;
  confidenceScore: number;
  details:         NodeChangeDetails;
  relations?: {
    side: 'from' | 'to'; entityId: string | null; nodeRefId: string | null;
    nodeId: string | null; weight: number | null; sortOrder: number;
  }[];
}

export const DocumentComparison = appSchema.table('document_comparisons', {
  id:             text('id').primaryKey(),
  documentId:     text('document_id').notNull().references(() => Document.id),
  fromVersionId:  text('from_version_id').notNull(),
  toVersionId:    text('to_version_id').notNull(),
  fromRevisionId: text('from_revision_id').notNull().references(() => DocumentRevision.id),
  toRevisionId:   text('to_revision_id').notNull().references(() => DocumentRevision.id),
  changes:        jsonb('changes').$type<StoredDocumentChange[]>().notNull(),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, table => [
  foreignKey({ columns: [table.fromVersionId, table.documentId, table.fromRevisionId], foreignColumns: [DocumentRelease.id, DocumentRelease.documentId, DocumentRelease.sourceRevisionId] }),
  foreignKey({ columns: [table.toVersionId, table.documentId, table.toRevisionId], foreignColumns: [DocumentRelease.id, DocumentRelease.documentId, DocumentRelease.sourceRevisionId] }),
  uniqueIndex('document_comparisons_versions_revisions_uq').on(table.documentId, table.fromVersionId, table.toVersionId, table.fromRevisionId, table.toRevisionId),
]);

export const changeReviewStatus = appSchema.enum('document_change_review_status', modelChangeReviewStatus.enum);

export const DocumentChangeReview = appSchema.table('document_change_reviews', {
  id:              uuid('id').primaryKey().defaultRandom(),
  comparisonId:    text('comparison_id').notNull().references(() => DocumentComparison.id),
  changeId:        text('change_id').notNull(),
  status:          changeReviewStatus('status').notNull(),
  revision:        integer('revision').notNull(),
  isLatest:        boolean('is_latest').notNull().default(true),
  reason:          text('reason'),
  reviewerId:      text('reviewer_id').notNull().references(() => users.id),
  reviewedAt:      timestamp('reviewed_at').notNull().defaultNow(),
  overridePayload: jsonb('override_payload').$type<ChangeReviewOverridePayload>(),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
}, table => [
  uniqueIndex('document_change_reviews_change_latest_uq').on(table.changeId).where(sql`${table.isLatest} = true`),
  uniqueIndex('document_change_reviews_change_revision_uq').on(table.changeId, table.revision),
  index('document_change_reviews_comparison_idx').on(table.comparisonId, table.isLatest),
]);
