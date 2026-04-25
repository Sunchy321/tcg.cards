import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '#db/db';
import {
  DocumentNode,
  DocumentNodeChange,
  DocumentChangeReviewState,
  DocumentNodeEntity,
  DocumentVersion,
  DocumentVersionImport,
  DocumentVersionPairRevision,
} from '#schema/magic/document';

import {
  loadPreviousVersionNodes,
  loadVersionNodesAsParsed,
  matchEntities,
} from './matcher';

export async function getNodeHistory(input: {
  documentId: string;
  entityId:   string;
}) {
  const entity = await db
    .select({
      id:               DocumentNodeEntity.id,
      originVersionId:  DocumentNodeEntity.originVersionId,
      originNodeId:     DocumentNodeEntity.originNodeId,
      currentVersionId: DocumentNodeEntity.currentVersionId,
      totalRevisions:   DocumentNodeEntity.totalRevisions,
    })
    .from(DocumentNodeEntity)
    .where(eq(DocumentNodeEntity.id, input.entityId))
    .limit(1)
    .then(rows => rows[0]);

  if (!entity) {
    throw new Error(`Entity not found: ${input.entityId}`);
  }

  const [appearances, changes] = await Promise.all([
    db.select({
      versionId:  DocumentNode.versionId,
      versionTag: DocumentVersion.versionTag,
      nodeRefId:  DocumentNode.id,
      nodeId:     DocumentNode.nodeId,
      path:       DocumentNode.path,
      nodeKind:   DocumentNode.nodeKind,
    })
      .from(DocumentNode)
      .innerJoin(DocumentVersion, eq(DocumentVersion.id, DocumentNode.versionId))
      .where(and(
        eq(DocumentNode.documentId, input.documentId),
        eq(DocumentNode.entityId, input.entityId),
      ))
      .orderBy(asc(DocumentVersion.versionTag)),

    db.select({
      id:               DocumentNodeChange.id,
      fromVersionId:    DocumentNodeChange.fromVersionId,
      toVersionId:      DocumentNodeChange.toVersionId,
      type:             DocumentNodeChange.type,
      confidenceScore:  DocumentNodeChange.confidenceScore,
      reviewStateCache: DocumentChangeReviewState.reviewState,
      details:          DocumentNodeChange.details,
    })
      .from(DocumentNodeChange)
      .leftJoin(DocumentChangeReviewState, eq(DocumentChangeReviewState.changeId, DocumentNodeChange.id))
      .where(and(
        eq(DocumentNodeChange.documentId, input.documentId),
        eq(DocumentNodeChange.entityId, input.entityId),
      ))
      .orderBy(asc(DocumentNodeChange.createdAt))
      .then(rows => rows.map(row => ({
        ...row,
        reviewStateCache: row.reviewStateCache ?? 'unreviewed',
      }))),
  ]);

  return { entity, appearances, changes };
}

export async function compareVersions(input: {
  documentId:    string;
  fromVersionId: string;
  toVersionId:   string;
}) {
  // Check if this is an adjacent pair by looking for precomputed changes
  const precomputed = await db
    .select({
      id:               DocumentNodeChange.id,
      entityId:         DocumentNodeChange.entityId,
      fromNodeRefId:    DocumentNodeChange.fromNodeRefId,
      toNodeRefId:      DocumentNodeChange.toNodeRefId,
      type:             DocumentNodeChange.type,
      confidenceScore:  DocumentNodeChange.confidenceScore,
      reviewStateCache: DocumentChangeReviewState.reviewState,
      details:          DocumentNodeChange.details,
      reviewedAt:       DocumentChangeReviewState.reviewedAt,
    })
    .from(DocumentNodeChange)
    .leftJoin(DocumentChangeReviewState, eq(DocumentChangeReviewState.changeId, DocumentNodeChange.id))
    .leftJoin(DocumentNode, eq(DocumentNode.id, DocumentNodeChange.toNodeRefId))
    .where(and(
      eq(DocumentNodeChange.documentId, input.documentId),
      eq(DocumentNodeChange.fromVersionId, input.fromVersionId),
      eq(DocumentNodeChange.toVersionId, input.toVersionId),
    ))
    .orderBy(sql`coalesce(${DocumentNode.path}, '') asc`)
    .then(rows => rows.map(row => ({
      ...row,
      reviewStateCache: row.reviewStateCache ?? 'unreviewed',
      reviewedAt:       row.reviewedAt ?? null,
    })));

  // Get review revision
  const pairRevision = await db
    .select({ reviewRevision: DocumentVersionPairRevision.reviewRevision })
    .from(DocumentVersionPairRevision)
    .where(and(
      eq(DocumentVersionPairRevision.documentId, input.documentId),
      eq(DocumentVersionPairRevision.fromVersionId, input.fromVersionId),
      eq(DocumentVersionPairRevision.toVersionId, input.toVersionId),
    ))
    .limit(1)
    .then(rows => rows[0]);

  // If precomputed changes exist, this is a reviewed_chain result
  if (precomputed.length > 0) {
    return {
      diffMode:       'reviewed_chain' as const,
      changes:        precomputed,
      reviewRevision: pairRevision?.reviewRevision ?? 0,
    };
  }

  // Check if both versions exist and are completed
  const [fromVersion, toVersion] = await Promise.all([
    db.select({ id: DocumentVersion.id, versionTag: DocumentVersion.versionTag })
      .from(DocumentVersion)
      .innerJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
      .where(and(
        eq(DocumentVersion.id, input.fromVersionId),
        eq(DocumentVersionImport.importStatus, 'completed'),
      ))
      .limit(1)
      .then(rows => rows[0]),

    db.select({ id: DocumentVersion.id, versionTag: DocumentVersion.versionTag })
      .from(DocumentVersion)
      .innerJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
      .where(and(
        eq(DocumentVersion.id, input.toVersionId),
        eq(DocumentVersionImport.importStatus, 'completed'),
      ))
      .limit(1)
      .then(rows => rows[0]),
  ]);

  if (!fromVersion) {
    throw new Error(`From version not found or not completed: ${input.fromVersionId}`);
  }

  if (!toVersion) {
    throw new Error(`To version not found or not completed: ${input.toVersionId}`);
  }

  // Compute snapshot diff on the fly (not persisted)
  const oldNodes = await loadPreviousVersionNodes(input.fromVersionId);
  const newParsedNodes = await loadVersionNodesAsParsed(input.toVersionId);
  const result = matchEntities(oldNodes, newParsedNodes, input.toVersionId);

  const changes = result.changes
    .map(c => ({
      id:               null as string | null,
      entityId:         c.entityId,
      fromNodeRefId:    c.fromNodeRefId,
      toNodeRefId:      c.toNodeRefId,
      type:             c.type,
      confidenceScore:  c.confidenceScore,
      reviewStateCache: c.reviewStateCache ?? ('unreviewed' as const),
      details:          c.details,
      reviewedAt:       null as Date | null,
    }))
    .sort((a, b) => {
      const pathA = a.details?.newPath ?? a.details?.oldPath ?? '';
      const pathB = b.details?.newPath ?? b.details?.oldPath ?? '';
      return pathA.localeCompare(pathB);
    });

  return {
    diffMode:       'snapshot' as const,
    changes,
    reviewRevision: 0,
  };
}
