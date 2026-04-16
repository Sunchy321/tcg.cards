import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '#db/db';
import {
  DocumentChangeReview,
  DocumentNodeChange,
  DocumentNodeChangeRelation,
  DocumentVersion,
  DocumentVersionImport,
  DocumentVersionPairRevision,
} from '#schema/magic/document';

import type {
  ChangeReviewOverridePayload,
  ChangeReviewStatus,
  NodeChangeReviewStateCache,
} from '#model/magic/schema/document';

function reviewStatusToCache(status: ChangeReviewStatus): NodeChangeReviewStateCache {
  switch (status) {
  case 'confirmed': return 'confirmed';
  case 'rejected': return 'rejected';
  case 'override': return 'overridden';
  case 'pending': return 'pending';
  }
}

async function ensureNoActiveImport(documentId: string) {
  const processing = await db
    .select({ id: DocumentVersionImport.versionId })
    .from(DocumentVersionImport)
    .innerJoin(DocumentVersion, eq(DocumentVersion.id, DocumentVersionImport.versionId))
    .where(and(
      eq(DocumentVersion.documentId, documentId),
      eq(DocumentVersionImport.importStatus, 'processing'),
    ))
    .limit(1);

  if (processing.length > 0) {
    throw new Error('Cannot review changes while an import is in progress');
  }
}

export async function submitReview(input: {
  changeId:         string;
  status:           'confirmed' | 'rejected' | 'override';
  reason?:          string;
  reviewerId?:      string;
  overridePayload?: ChangeReviewOverridePayload;
}) {
  return db.transaction(async tx => {
    // Load the change record
    const change = await tx
      .select({
        id:               DocumentNodeChange.id,
        documentId:       DocumentNodeChange.documentId,
        fromVersionId:    DocumentNodeChange.fromVersionId,
        toVersionId:      DocumentNodeChange.toVersionId,
        reviewStateCache: DocumentNodeChange.reviewStateCache,
      })
      .from(DocumentNodeChange)
      .where(eq(DocumentNodeChange.id, input.changeId))
      .limit(1)
      .then(rows => rows[0]);

    if (!change) {
      throw new Error(`Change not found: ${input.changeId}`);
    }

    await ensureNoActiveImport(change.documentId);

    // Get current latest review (if any) for revision number
    const currentReview = await tx
      .select({ id: DocumentChangeReview.id, revision: DocumentChangeReview.revision })
      .from(DocumentChangeReview)
      .where(and(
        eq(DocumentChangeReview.changeId, input.changeId),
        eq(DocumentChangeReview.isLatest, true),
      ))
      .limit(1)
      .then(rows => rows[0]);

    const nextRevision = (currentReview?.revision ?? 0) + 1;

    // Mark old review as not latest
    if (currentReview) {
      await tx.update(DocumentChangeReview)
        .set({ isLatest: false })
        .where(eq(DocumentChangeReview.id, currentReview.id));
    }

    // Insert new review
    const now = new Date();

    const [inserted] = await tx.insert(DocumentChangeReview).values({
      changeId:        input.changeId,
      status:          input.status,
      revision:        nextRevision,
      isLatest:        true,
      reason:          input.reason ?? null,
      reviewerId:      input.reviewerId ?? null,
      reviewedAt:      now,
      overridePayload: input.status === 'override' ? (input.overridePayload ?? null) : null,
    }).returning({ id: DocumentChangeReview.id });

    // Update change cache
    const cacheValue = reviewStatusToCache(input.status);

    await tx.update(DocumentNodeChange)
      .set({
        reviewStateCache: cacheValue,
        reviewedAt:       now,
      })
      .where(eq(DocumentNodeChange.id, input.changeId));

    // Upsert version pair revision (only increment when conclusion changes)
    const conclusionChanged = cacheValue !== change.reviewStateCache;
    const pairId = `${change.fromVersionId}->${change.toVersionId}`;

    if (conclusionChanged) {
      await tx.insert(DocumentVersionPairRevision)
        .values({
          id:             pairId,
          documentId:     change.documentId,
          fromVersionId:  change.fromVersionId,
          toVersionId:    change.toVersionId,
          reviewRevision: 1,
        })
        .onConflictDoUpdate({
          target: DocumentVersionPairRevision.id,
          set:    { reviewRevision: sql`${DocumentVersionPairRevision.reviewRevision} + 1` },
        });
    }

    return {
      reviewId:         inserted!.id,
      reviewStateCache: cacheValue,
    };
  });
}

export async function batchReview(input: {
  changeIds:   string[];
  status:      'confirmed' | 'rejected';
  reason?:     string;
  reviewerId?: string;
}) {
  let reviewed = 0;

  for (const changeId of input.changeIds) {
    await submitReview({
      changeId,
      status:     input.status,
      reason:     input.reason,
      reviewerId: input.reviewerId,
    });
    reviewed++;
  }

  return { reviewed };
}

export async function listChanges(input: {
  documentId:    string;
  fromVersionId: string;
  toVersionId:   string;
  status?:       NodeChangeReviewStateCache[];
  page?:         number;
  pageSize?:     number;
}) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  const offset = (page - 1) * pageSize;

  const conditions = [
    eq(DocumentNodeChange.documentId, input.documentId),
    eq(DocumentNodeChange.fromVersionId, input.fromVersionId),
    eq(DocumentNodeChange.toVersionId, input.toVersionId),
  ];

  if (input.status && input.status.length > 0) {
    conditions.push(inArray(DocumentNodeChange.reviewStateCache, input.status));
  }

  const where = and(...conditions);

  const [items, countResult, pairRevision] = await Promise.all([
    db.select({
      id:               DocumentNodeChange.id,
      entityId:         DocumentNodeChange.entityId,
      fromNodeRefId:    DocumentNodeChange.fromNodeRefId,
      toNodeRefId:      DocumentNodeChange.toNodeRefId,
      type:             DocumentNodeChange.type,
      confidenceScore:  DocumentNodeChange.confidenceScore,
      reviewStateCache: DocumentNodeChange.reviewStateCache,
      details:          DocumentNodeChange.details,
      reviewedAt:       DocumentNodeChange.reviewedAt,
    })
      .from(DocumentNodeChange)
      .where(where)
      .orderBy(DocumentNodeChange.confidenceScore)
      .limit(pageSize)
      .offset(offset),

    db.select({ count: sql<number>`count(*)` })
      .from(DocumentNodeChange)
      .where(where)
      .then(rows => rows[0]!),

    db.select({ reviewRevision: DocumentVersionPairRevision.reviewRevision })
      .from(DocumentVersionPairRevision)
      .where(and(
        eq(DocumentVersionPairRevision.documentId, input.documentId),
        eq(DocumentVersionPairRevision.fromVersionId, input.fromVersionId),
        eq(DocumentVersionPairRevision.toVersionId, input.toVersionId),
      ))
      .limit(1)
      .then(rows => rows[0]),
  ]);

  return {
    items,
    total:          countResult.count,
    page,
    pageSize,
    reviewRevision: pairRevision?.reviewRevision ?? 0,
  };
}

export async function getChangeDetail(changeId: string) {
  const change = await db
    .select()
    .from(DocumentNodeChange)
    .where(eq(DocumentNodeChange.id, changeId))
    .limit(1)
    .then(rows => rows[0]);

  if (!change) {
    throw new Error(`Change not found: ${changeId}`);
  }

  const [relations, reviews] = await Promise.all([
    db.select()
      .from(DocumentNodeChangeRelation)
      .where(eq(DocumentNodeChangeRelation.changeId, changeId))
      .orderBy(DocumentNodeChangeRelation.sortOrder),

    db.select()
      .from(DocumentChangeReview)
      .where(eq(DocumentChangeReview.changeId, changeId))
      .orderBy(desc(DocumentChangeReview.revision)),
  ]);

  return { change, relations, reviews };
}
