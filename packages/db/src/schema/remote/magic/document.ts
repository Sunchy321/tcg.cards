import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { ChangeReviewOverridePayload } from '#model/magic/schema/document';

import {
  changeReviewStatus as modelChangeReviewStatus,
  nodeChangeReviewStateCache as modelNodeChangeReviewStateCache,
} from '#model/magic/schema/document';

import {
  DocumentDefinition,
  DocumentNodeChange,
  DocumentVersion,
} from '../../shared/magic/document';
import { appSchema } from '../../shared/magic/schema';

export const nodeChangeReviewStateCache = appSchema.enum(
  'document_node_change_review_state_cache',
  modelNodeChangeReviewStateCache.enum,
);
export const changeReviewStatus = appSchema.enum(
  'document_change_review_status',
  modelChangeReviewStatus.enum,
);

export const DocumentChangeReview = appSchema.table('document_change_reviews', {
  id:              uuid('id').primaryKey().defaultRandom(),
  changeId:        uuid('change_id').notNull().references(() => DocumentNodeChange.id),
  status:          changeReviewStatus('status').notNull(),
  revision:        integer('revision').notNull(),
  isLatest:        boolean('is_latest').notNull().default(true),
  reason:          text('reason'),
  reviewerId:      text('reviewer_id'),
  reviewedAt:      timestamp('reviewed_at'),
  overridePayload: jsonb('override_payload').$type<ChangeReviewOverridePayload>(),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
}, table => [
  uniqueIndex('document_change_reviews_change_id_latest_uq')
    .on(table.changeId)
    .where(sql`${table.isLatest} = true`),
  index('document_change_reviews_change_id_is_latest_revision_idx').on(table.changeId, table.isLatest, table.revision),
]);

export const DocumentChangeReviewState = appSchema.table('document_change_review_states', {
  changeId:       uuid('change_id').primaryKey().references(() => DocumentNodeChange.id),
  reviewState:    nodeChangeReviewStateCache('review_state').notNull().default('unreviewed'),
  reviewedAt:     timestamp('reviewed_at'),
  latestReviewId: uuid('latest_review_id').references(() => DocumentChangeReview.id),
  updatedAt:      timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('document_change_review_states_review_state_idx').on(table.reviewState),
  uniqueIndex('document_change_review_states_latest_review_id_uq')
    .on(table.latestReviewId)
    .where(sql`${table.latestReviewId} is not null`),
]);

export const DocumentVersionPairRevision = appSchema.table('document_version_pair_revisions', {
  id:             text('id').primaryKey(),
  documentId:     text('document_id').notNull().references(() => DocumentDefinition.id),
  fromVersionId:  text('from_version_id').notNull().references(() => DocumentVersion.id),
  toVersionId:    text('to_version_id').notNull().references(() => DocumentVersion.id),
  reviewRevision: integer('review_revision').notNull().default(0),
  updatedAt:      timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  uniqueIndex('doc_ver_pair_rev_doc_from_to_uq')
    .on(table.documentId, table.fromVersionId, table.toVersionId),
]);
