import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@tcg-cards/db/db';
import { DocumentChangeReview, DocumentComparison } from '@tcg-cards/db/schema/remote/magic/document';
import { DocumentRevisionNode } from '@tcg-cards/db/schema/remote/magic/documents';
import type { ChangeReviewOverridePayload, NodeChangeReviewStateCache } from '@tcg-cards/model/magic/schema/document';
import type { StoredDocumentChange } from '@tcg-cards/db/schema/remote/magic/document';

import { createDocumentStore } from './database';
import { createComparisonOperations } from './comparison';
import { matchRevisionNodes } from './matcher';

/** Locate a formal edition pair by stable release identities. */
interface VersionPair { documentId: string; fromVersionId: string; toVersionId: string }
/** Append an authenticated conclusion while retaining earlier reviews. */
interface ReviewInput { changeId: string; status: 'confirmed' | 'rejected' | 'override'; reason?: string; reviewerId?: string; overridePayload?: ChangeReviewOverridePayload }

/** Cache deterministic comparison targets against their exact source snapshots. */
async function comparison(input: VersionPair) {
  const store = createDocumentStore(db, 'remote');
  const document = await store.document(input.documentId);
  if (document == null || document.deletedAt != null) throw new Error('Document not found');
  const releases = (await store.releases(document.id)).filter(row => row.deletedAt == null);
  const from = releases.find(row => row.id === input.fromVersionId);
  const to = releases.find(row => row.id === input.toVersionId);
  if (from == null || to == null) throw new Error('Release not found');
  const id = createHash('sha256').update(JSON.stringify([document.id, from.id, to.id, from.sourceRevisionId, to.sourceRevisionId])).digest('hex');
  const [existing] = await db.select().from(DocumentComparison).where(eq(DocumentComparison.id, id)).limit(1);
  if (existing != null) return existing;
  const previous = await store.revision(from.sourceRevisionId);
  const next = await store.revision(to.sourceRevisionId);
  if (previous == null || next == null) throw new Error('Release content missing');
  const result = matchRevisionNodes(previous, next.nodes.map(node => ({ id: node.id, documentId: document.id,
    versionId: next.id, nodeId: node.anchor ?? node.nodeKey, nodeKind: node.kind, path: node.path,
    level: node.level, parentNodeId: node.parentId, siblingOrder: node.siblingOrder, content: node.rawText })), next.id);
  const nodeKeys = new Map([...previous.nodes, ...next.nodes].map(node => [node.id, node.nodeKey]));
  const changes: StoredDocumentChange[] = result.changes.map((change, index) => {
    // Split/merge assignments are generated during matching; persisted node keys are authoritative.
    const primaryId = change.type === 'split' ? change.fromNodeRefId : change.toNodeRefId ?? change.fromNodeRefId;
    return { id: `${id}:${index}`, entityId: primaryId == null ? change.entityId : nodeKeys.get(primaryId) ?? change.entityId, fromNodeRefId: change.fromNodeRefId,
      toNodeRefId: change.toNodeRefId, type: change.type, confidenceScore: change.confidenceScore, details: change.details,
      relations: change.relations?.map(relation => ({ ...relation, entityId: relation.nodeRefId == null ? relation.entityId : nodeKeys.get(relation.nodeRefId) ?? relation.entityId })) };
  });
  const row = { id, ...input, fromRevisionId: previous.id, toRevisionId: next.id, changes };
  await db.insert(DocumentComparison).values(row).onConflictDoNothing({ target: DocumentComparison.id });
  const [saved] = await db.select().from(DocumentComparison).where(eq(DocumentComparison.id, id)).limit(1);
  if (saved == null) throw new Error('Comparison could not be saved');
  return saved;
}

/** Translate stored conclusions into the existing administration contract. */
function reviewState(status?: string): NodeChangeReviewStateCache {
  return status === 'override' ? 'overridden' : status === 'confirmed' || status === 'rejected' || status === 'pending' ? status : 'unreviewed';
}

/** Return cached differences with their latest independent user conclusions. */
export async function compareVersions(input: VersionPair) {
  const pair = await comparison(input);
  const reviews = await db.select().from(DocumentChangeReview).where(and(eq(DocumentChangeReview.comparisonId, pair.id), eq(DocumentChangeReview.isLatest, true)));
  const byChange = new Map(reviews.map(row => [row.changeId, row]));
  return { diffMode: reviews.length > 0 ? 'reviewed_chain' as const : 'snapshot' as const,
    changes: pair.changes.map(change => ({ ...change, reviewStateCache: reviewState(byChange.get(change.id)?.status), reviewedAt: byChange.get(change.id)?.reviewedAt ?? null })),
    reviewRevision: reviews.reduce((sum, review) => sum + review.revision, 0) };
}

/** Page comparison results after applying review-state filters. */
export async function listChanges(input: VersionPair & { status?: NodeChangeReviewStateCache[]; page?: number; pageSize?: number }) {
  const result = await compareVersions(input);
  const items = result.changes.filter(change => !input.status?.length || input.status.includes(change.reviewStateCache));
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 50;
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, reviewRevision: result.reviewRevision };
}

/** Resolve an encoded comparison identity and verify the target still exists. */
async function locateChange(changeId: string) {
  const comparisonId = changeId.slice(0, changeId.lastIndexOf(':'));
  const [pair] = await db.select().from(DocumentComparison).where(eq(DocumentComparison.id, comparisonId)).limit(1);
  const change = pair?.changes.find(row => row.id === changeId);
  if (pair == null || change == null) throw new Error('Change not found');
  return { pair, change };
}

/** Read comparison metadata and append-only review history for one change. */
export async function getChangeDetail(changeId: string) {
  const { pair, change } = await locateChange(changeId);
  const reviews = await db.select().from(DocumentChangeReview).where(eq(DocumentChangeReview.changeId, changeId)).orderBy(desc(DocumentChangeReview.revision));
  return { change: { ...change, documentId: pair.documentId, fromVersionId: pair.fromVersionId, toVersionId: pair.toVersionId,
    reviewStateCache: reviewState(reviews[0]?.status), reviewedAt: reviews[0]?.reviewedAt ?? null, createdAt: pair.createdAt },
    relations: change.relations ?? [], reviews };
}

/** Serialize conclusions per comparison and preserve all previous decisions. */
export async function submitReview(input: ReviewInput) {
  if (input.reviewerId == null) throw new Error('Login required');
  const { pair } = await locateChange(input.changeId);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`magic-document-review:${pair.id}`}))`);
    const [previous] = await tx.select().from(DocumentChangeReview).where(and(eq(DocumentChangeReview.changeId, input.changeId), eq(DocumentChangeReview.isLatest, true))).limit(1);
    if (previous != null) await tx.update(DocumentChangeReview).set({ isLatest: false }).where(eq(DocumentChangeReview.id, previous.id));
    const [inserted] = await tx.insert(DocumentChangeReview).values({ comparisonId: pair.id, changeId: input.changeId,
      status: input.status, revision: (previous?.revision ?? 0) + 1, isLatest: true,
      reason: input.reason ?? null, reviewerId: input.reviewerId!, reviewedAt: new Date(),
      overridePayload: input.status === 'override' ? input.overridePayload ?? null : null }).returning({ id: DocumentChangeReview.id });
    return { reviewId: inserted!.id, reviewStateCache: reviewState(input.status) };
  });
}

/** Apply the same authenticated conclusion to a bounded set of change targets. */
export async function batchReview(input: { changeIds: string[]; status: 'confirmed' | 'rejected'; reason?: string; reviewerId?: string }) {
  for (const changeId of input.changeIds) await submitReview({ ...input, changeId });
  return { reviewed: input.changeIds.length };
}

/** Read formal node history through the shared access-controlled content model. */
export async function getNodeHistory(input: { documentId: string; entityId: string }, actorId?: string) {
  return createComparisonOperations(createDocumentStore(db, 'remote'), { track: 'remote', actorId }).nodeHistory({ documentId: input.documentId, nodeKey: input.entityId });
}

/** Read authoritative node text for authenticated administration requests. */
export async function getNodeContents(nodeIds: string[]): Promise<Record<string, string | null>> {
  const rows = await db.select({ id: DocumentRevisionNode.id, text: DocumentRevisionNode.rawText }).from(DocumentRevisionNode).where(inArray(DocumentRevisionNode.id, nodeIds));
  const contents = new Map(rows.map(row => [row.id, row.text]));
  return Object.fromEntries(nodeIds.map(id => [id, contents.get(id) ?? null]));
}
