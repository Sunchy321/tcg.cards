import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';

import { db } from '#db/db';
import {
  DocumentChangeReview,
  DocumentDefinition,
  DocumentNode,
  DocumentNodeChange,
  DocumentNodeChangeRelation,
  DocumentNodeContent,
  DocumentNodeEntity,
  DocumentVersion,
  DocumentVersionImport,
  DocumentVersionPairRevision,
} from '#schema/magic/document';

import { getDocumentConfig } from './config';
import {
  type ChangeRecord,
  type EntityAssignment,
  findPreviousVersion,
  loadPreviousVersionNodes,
  loadVersionNodesAsParsed,
  loadVersionNodesForRematch,
  matchEntities,
} from './matcher';
import { parseMagicCrDocument, type ParsedDocumentNode } from './parser';

const normalizedContentVersion = 'magic-document-fingerprint-v1';

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DocumentPreview = ReturnType<typeof parseDocumentPreview>;

function normalizeDocumentText(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd() + '\n';
}

function parseHumanDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractVersionTag(content: string): string | null {
  const match = content.match(/These rules are effective as of ([A-Za-z]+ \d{1,2}, \d{4})\./i);
  if (!match) {
    return null;
  }

  const isoDate = parseHumanDate(match[1] ?? null);
  if (!isoDate) {
    return null;
  }

  return isoDate.replaceAll('-', '');
}

function versionTagToDate(versionTag: string): string {
  return `${versionTag.slice(0, 4)}-${versionTag.slice(4, 6)}-${versionTag.slice(6, 8)}`;
}

export function generateHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function normalizeFingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}'"“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function gzipContent(content: string): Buffer {
  return gzipSync(Buffer.from(content, 'utf8'));
}

function summarizeNodes(nodes: ParsedDocumentNode[]) {
  return {
    heading:         nodes.filter(node => node.nodeKind === 'heading').length,
    implicitHeading: nodes.filter(node => node.nodeKind === 'implicit_heading').length,
    content:         nodes.filter(node => node.nodeKind === 'content').length,
    example:         nodes.filter(node => node.nodeKind === 'example').length,
  };
}

function formatImportError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function toImportResult(preview: DocumentPreview, importedAt: Date) {
  return {
    documentId:    preview.documentId,
    versionId:     preview.versionId,
    versionTag:    preview.versionTag,
    effectiveDate: preview.effectiveDate,
    totalNodes:    preview.nodes.length,
    summary:       preview.summary,
    importedAt,
  };
}

export function parseDocumentPreview(input: {
  documentId?: string;
  content:     string;
  versionTag?: string;
}) {
  const documentId = input.documentId ?? 'magic-cr';
  const config = getDocumentConfig(documentId);
  if (!config) {
    throw new Error(`Unsupported document: ${documentId}`);
  }

  const normalized = normalizeDocumentText(input.content);
  const versionTag = input.versionTag ?? extractVersionTag(normalized);
  if (!versionTag) {
    throw new Error('Cannot extract version tag from document content');
  }

  const parsed = parseMagicCrDocument({
    documentId,
    versionTag,
    content: normalized,
  });

  const effectiveDate = parseHumanDate(parsed.effectiveDate);

  return {
    ...parsed,
    effectiveDate,
    publishedAt: effectiveDate,
    summary:     summarizeNodes(parsed.nodes),
    sampleNodes: parsed.nodes.slice(0, 20),
  };
}

async function ensureDocumentDefinition(documentId: string) {
  const config = getDocumentConfig(documentId);
  if (!config) {
    throw new Error(`Unsupported document: ${documentId}`);
  }

  await db.insert(DocumentDefinition)
    .values({
      id:             config.id,
      slug:           config.slug,
      name:           config.name,
      game:           config.game,
      sourceLocale:   config.sourceLocale,
      parserStrategy: config.parserStrategy,
      nodeIdPattern:  null,
      status:         'active',
    })
    .onConflictDoNothing();
}

async function getVersionImportState(versionId: string) {
  return await db
    .select({
      id:                       DocumentVersion.id,
      documentId:               DocumentVersion.documentId,
      totalNodes:               DocumentVersion.totalNodes,
      sourceFileHash:           DocumentVersionImport.sourceFileHash,
      parserVersion:            DocumentVersionImport.parserVersion,
      normalizedContentVersion: DocumentVersionImport.normalizedContentVersion,
      importStatus:             DocumentVersionImport.importStatus,
      importedAt:               DocumentVersionImport.importedAt,
    })
    .from(DocumentVersion)
    .leftJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
    .where(eq(DocumentVersion.id, versionId))
    .limit(1)
    .then(rows => rows[0] ?? null);
}

async function clearVersionDerivedData(tx: DbTx, versionId: string) {
  const changes = await tx
    .select({ id: DocumentNodeChange.id })
    .from(DocumentNodeChange)
    .where(or(
      eq(DocumentNodeChange.fromVersionId, versionId),
      eq(DocumentNodeChange.toVersionId, versionId),
    ));

  const changeIds = changes.map(change => change.id);

  if (changeIds.length > 0) {
    await tx.delete(DocumentChangeReview)
      .where(inArray(DocumentChangeReview.changeId, changeIds));

    await tx.delete(DocumentNodeChangeRelation)
      .where(inArray(DocumentNodeChangeRelation.changeId, changeIds));

    await tx.delete(DocumentNodeChange)
      .where(inArray(DocumentNodeChange.id, changeIds));
  }

  await tx.delete(DocumentVersionPairRevision)
    .where(or(
      eq(DocumentVersionPairRevision.fromVersionId, versionId),
      eq(DocumentVersionPairRevision.toVersionId, versionId),
    ));
}

async function clearVersionSnapshot(tx: DbTx, versionId: string) {
  const nodes = await tx
    .select({
      id:       DocumentNode.id,
      entityId: DocumentNode.entityId,
    })
    .from(DocumentNode)
    .where(eq(DocumentNode.versionId, versionId));

  const nodeIds = nodes.map(node => node.id);
  const entityIds = [...new Set(nodes.map(node => node.entityId))];

  if (nodeIds.length > 0) {
    await tx.update(DocumentNodeEntity)
      .set({
        currentNodeRefId: null,
        currentNodeId:    null,
        currentVersionId: null,
      })
      .where(and(
        inArray(DocumentNodeEntity.id, entityIds),
        eq(DocumentNodeEntity.currentVersionId, versionId),
      ));

    await tx.delete(DocumentNodeContent)
      .where(inArray(DocumentNodeContent.documentNodeId, nodeIds));

    await tx.delete(DocumentNode)
      .where(inArray(DocumentNode.id, nodeIds));
  }

  if (entityIds.length > 0) {
    await tx.delete(DocumentNodeEntity)
      .where(and(
        inArray(DocumentNodeEntity.id, entityIds),
        eq(DocumentNodeEntity.originVersionId, versionId),
      ));
  }
}

async function syncDocumentVersionLifecycle(tx: DbTx, documentId: string) {
  const versions = await tx
    .select({
      id:           DocumentVersion.id,
      importStatus: DocumentVersionImport.importStatus,
    })
    .from(DocumentVersion)
    .leftJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
    .where(eq(DocumentVersion.documentId, documentId))
    .orderBy(desc(DocumentVersion.versionTag));

  const activeVersionId = versions.find(version => version.importStatus === 'completed')?.id;

  if (!activeVersionId) {
    return;
  }

  await tx.update(DocumentVersion)
    .set({ lifecycleStatus: 'superseded' })
    .where(and(
      eq(DocumentVersion.documentId, documentId),
      ne(DocumentVersion.id, activeVersionId),
    ));

  await tx.update(DocumentVersion)
    .set({ lifecycleStatus: 'active' })
    .where(eq(DocumentVersion.id, activeVersionId));
}

async function prepareVersionImport(input: {
  preview:                  DocumentPreview;
  sourceFileHash:           string;
  parserVersion:            string;
  normalizedContentVersion: string;
  importRunId:              string;
  effectiveDate:            string;
  publishedAt:              string;
}) {
  const {
    preview,
    sourceFileHash,
    parserVersion,
    importRunId,
    effectiveDate,
    publishedAt,
  } = input;

  await db.transaction(async tx => {
    await tx.insert(DocumentVersion)
      .values({
        id:              preview.versionId,
        versionTag:      preview.versionTag,
        documentId:      preview.documentId,
        effectiveDate,
        publishedAt,
        txtUrl:          null,
        pdfUrl:          null,
        docxUrl:         null,
        totalNodes:      preview.nodes.length,
        lifecycleStatus: 'active',
      })
      .onConflictDoUpdate({
        target: DocumentVersion.id,
        set:    {
          versionTag: preview.versionTag,
          documentId: preview.documentId,
          effectiveDate,
          publishedAt,
          txtUrl:     null,
          pdfUrl:     null,
          docxUrl:    null,
          totalNodes: preview.nodes.length,
        },
      });

    await tx.insert(DocumentVersionImport)
      .values({
        versionId:                preview.versionId,
        sourceFileHash,
        parserVersion,
        normalizedContentVersion: input.normalizedContentVersion,
        importRunId,
        importedAt:               null,
        importStatus:             'processing',
        importError:              null,
      })
      .onConflictDoUpdate({
        target: DocumentVersionImport.versionId,
        set:    {
          sourceFileHash,
          parserVersion,
          normalizedContentVersion: input.normalizedContentVersion,
          importRunId,
          importedAt:               null,
          importStatus:             'processing',
          importError:              null,
        },
      });

    await clearVersionDerivedData(tx, preview.versionId);
    await clearVersionSnapshot(tx, preview.versionId);
  });
}

async function writeVersionSnapshot(input: {
  preview:            DocumentPreview;
  sourceLocale:       'en' | 'zhs' | 'zht' | 'ja' | 'ko';
  entityAssignments?: Map<string, EntityAssignment>;
}) {
  const entityMap = new Map<string, string>();

  // Determine entity IDs for each node
  const newEntityValues: Array<{
    id:               string;
    documentId:       string;
    originVersionId:  string;
    originNodeId:     string;
    currentNodeRefId: null;
    currentNodeId:    null;
    currentVersionId: null;
    totalRevisions:   number;
  }> = [];

  for (const node of input.preview.nodes) {
    const assignment = input.entityAssignments?.get(node.nodeId);

    if (assignment) {
      entityMap.set(node.nodeId, assignment.entityId);
      if (assignment.isNew) {
        newEntityValues.push({
          id:               assignment.entityId,
          documentId:       input.preview.documentId,
          originVersionId:  assignment.originVersionId ?? input.preview.versionId,
          originNodeId:     assignment.originNodeId ?? node.nodeId,
          currentNodeRefId: null,
          currentNodeId:    null,
          currentVersionId: null,
          totalRevisions:   1,
        });
      }
    } else {
      // No assignment provided (first version) — create new entity
      const entityId = randomUUID();
      entityMap.set(node.nodeId, entityId);
      newEntityValues.push({
        id:               entityId,
        documentId:       input.preview.documentId,
        originVersionId:  input.preview.versionId,
        originNodeId:     node.nodeId,
        currentNodeRefId: null,
        currentNodeId:    null,
        currentVersionId: null,
        totalRevisions:   1,
      });
    }
  }

  await db.transaction(async tx => {
    if (newEntityValues.length > 0) {
      await tx.insert(DocumentNodeEntity).values(newEntityValues);
    }

    const nodeValues = input.preview.nodes.map(node => ({
      id:                    node.id,
      versionId:             input.preview.versionId,
      documentId:            input.preview.documentId,
      nodeId:                node.nodeId,
      nodeKind:              node.nodeKind,
      path:                  node.path,
      level:                 node.level,
      parentNodeId:          node.parentNodeId,
      siblingOrder:          node.siblingOrder,
      sourceContentHash:     null,
      sourceFingerprintHash: null,
      sourceContentRefId:    null,
      entityId:              entityMap.get(node.nodeId)!,
    }));

    if (nodeValues.length > 0) {
      await tx.insert(DocumentNode).values(nodeValues);
    }

    for (const node of input.preview.nodes) {
      if (!node.content) {
        continue;
      }

      const contentId = randomUUID();
      const contentHash = generateHash(node.content);
      const fingerprintHash = generateHash(normalizeFingerprint(node.content));
      const contentBuffer = Buffer.from(node.content, 'utf8');

      await tx.insert(DocumentNodeContent).values({
        id:                contentId,
        documentNodeId:    node.id,
        locale:            input.sourceLocale,
        content:           gzipContent(node.content),
        contentHash,
        fingerprintHash,
        size:              contentBuffer.length,
        sourceContentHash: contentHash,
        status:            'source',
      });

      await tx.update(DocumentNode)
        .set({
          sourceContentHash:     contentHash,
          sourceFingerprintHash: fingerprintHash,
          sourceContentRefId:    contentId,
        })
        .where(eq(DocumentNode.id, node.id));
    }
  });

  return entityMap;
}

async function finalizeVersionImport(input: {
  preview:            DocumentPreview;
  entityMap:          Map<string, string>;
  entityAssignments?: Map<string, EntityAssignment>;
  importedAt:         Date;
}) {
  await db.transaction(async tx => {
    for (const node of input.preview.nodes) {
      const entityId = input.entityMap.get(node.nodeId)!;
      const assignment = input.entityAssignments?.get(node.nodeId);
      const isReused = assignment ? !assignment.isNew : false;

      await tx.update(DocumentNodeEntity)
        .set({
          currentNodeRefId: node.id,
          currentNodeId:    node.nodeId,
          currentVersionId: input.preview.versionId,
          ...(isReused ? { totalRevisions: sql`${DocumentNodeEntity.totalRevisions} + 1` } : {}),
        })
        .where(eq(DocumentNodeEntity.id, entityId));
    }

    await tx.update(DocumentVersionImport)
      .set({
        importStatus: 'completed',
        importedAt:   input.importedAt,
        importError:  null,
      })
      .where(eq(DocumentVersionImport.versionId, input.preview.versionId));

    await syncDocumentVersionLifecycle(tx, input.preview.documentId);
  });
}

async function markVersionImportFailed(versionId: string, error: unknown) {
  await db.update(DocumentVersionImport)
    .set({
      importStatus: 'failed',
      importError:  formatImportError(error),
      importedAt:   null,
    })
    .where(eq(DocumentVersionImport.versionId, versionId));
}

async function deleteVersionGraph(versionId: string) {
  return await db.transaction(async tx => {
    const version = await tx
      .select({ documentId: DocumentVersion.documentId })
      .from(DocumentVersion)
      .where(eq(DocumentVersion.id, versionId))
      .limit(1)
      .then(rows => rows[0] ?? null);

    await clearVersionDerivedData(tx, versionId);
    await clearVersionSnapshot(tx, versionId);

    await tx.delete(DocumentVersionImport)
      .where(eq(DocumentVersionImport.versionId, versionId));

    await tx.delete(DocumentVersion)
      .where(eq(DocumentVersion.id, versionId));

    if (version) {
      await syncDocumentVersionLifecycle(tx, version.documentId);
    }
  });
}

export async function listDocumentVersions(documentId: string) {
  return await db
    .select({
      id:              DocumentVersion.id,
      versionTag:      DocumentVersion.versionTag,
      effectiveDate:   DocumentVersion.effectiveDate,
      publishedAt:     DocumentVersion.publishedAt,
      totalNodes:      DocumentVersion.totalNodes,
      lifecycleStatus: DocumentVersion.lifecycleStatus,
      importStatus:    DocumentVersionImport.importStatus,
      importError:     DocumentVersionImport.importError,
      importedAt:      DocumentVersionImport.importedAt,
      parserVersion:   DocumentVersionImport.parserVersion,
    })
    .from(DocumentVersion)
    .leftJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
    .where(eq(DocumentVersion.documentId, documentId))
    .orderBy(desc(DocumentVersion.versionTag));
}

async function writeChangeRecords(input: {
  changes:       ChangeRecord[];
  documentId:    string;
  fromVersionId: string;
  toVersionId:   string;
}) {
  if (input.changes.length === 0) return;

  const simpleChanges = input.changes.filter(c => !c.relations?.length);
  const complexChanges = input.changes.filter(c => c.relations?.length);

  // Batch insert simple changes (no relations)
  if (simpleChanges.length > 0) {
    const values = simpleChanges.map(change => ({
      documentId:       input.documentId,
      fromVersionId:    input.fromVersionId,
      toVersionId:      input.toVersionId,
      entityId:         change.entityId,
      fromNodeRefId:    change.fromNodeRefId,
      toNodeRefId:      change.toNodeRefId,
      type:             change.type,
      confidenceScore:  change.confidenceScore,
      reviewStateCache: change.reviewStateCache ?? 'unreviewed' as const,
      details:          change.details,
    }));

    await db.insert(DocumentNodeChange).values(values);
  }

  // Insert complex changes one by one to get changeId for relations
  for (const change of complexChanges) {
    const [inserted] = await db.insert(DocumentNodeChange).values({
      documentId:       input.documentId,
      fromVersionId:    input.fromVersionId,
      toVersionId:      input.toVersionId,
      entityId:         change.entityId,
      fromNodeRefId:    change.fromNodeRefId,
      toNodeRefId:      change.toNodeRefId,
      type:             change.type,
      confidenceScore:  change.confidenceScore,
      reviewStateCache: change.reviewStateCache ?? 'unreviewed' as const,
      details:          change.details,
    }).returning({ id: DocumentNodeChange.id });

    if (inserted && change.relations!.length > 0) {
      await db.insert(DocumentNodeChangeRelation).values(
        change.relations!.map(rel => ({
          changeId:  inserted.id,
          side:      rel.side,
          entityId:  rel.entityId,
          nodeRefId: rel.nodeRefId,
          nodeId:    rel.nodeId,
          weight:    rel.weight,
          sortOrder: rel.sortOrder,
        })),
      );
    }
  }
}

export async function importDocumentVersion(input: {
  documentId?: string;
  content:     string;
  versionTag?: string;
}) {
  const preview = parseDocumentPreview(input);
  const config = getDocumentConfig(preview.documentId);
  if (!config) {
    throw new Error(`Unsupported document: ${preview.documentId}`);
  }

  const importRunId = randomUUID();
  const importedAt = new Date();
  const sourceFileHash = generateHash(normalizeDocumentText(input.content));
  const effectiveDate = preview.effectiveDate ?? versionTagToDate(preview.versionTag);
  const publishedAt = preview.publishedAt ?? effectiveDate;
  const currentImport = await getVersionImportState(preview.versionId);

  if (
    currentImport?.importStatus === 'completed'
    && currentImport.importedAt
    && currentImport.sourceFileHash === sourceFileHash
    && currentImport.parserVersion === config.parserStrategy
    && currentImport.normalizedContentVersion === normalizedContentVersion
  ) {
    return toImportResult(preview, currentImport.importedAt);
  }

  await ensureDocumentDefinition(preview.documentId);

  try {
    await prepareVersionImport({
      preview,
      sourceFileHash,
      parserVersion: config.parserStrategy,
      normalizedContentVersion,
      importRunId,
      effectiveDate,
      publishedAt,
    });

    // Entity matching: find previous version and match nodes
    let entityAssignments: Map<string, EntityAssignment> | undefined;
    let changes: ChangeRecord[] = [];
    let previousVersionId: string | null = null;

    previousVersionId = await findPreviousVersion(preview.documentId, preview.versionTag);

    if (previousVersionId) {
      const oldNodes = await loadPreviousVersionNodes(previousVersionId);
      const matchResult = matchEntities(oldNodes, preview.nodes, preview.versionId);
      entityAssignments = matchResult.entityAssignments;
      changes = matchResult.changes;
    }

    const entityMap = await writeVersionSnapshot({
      preview,
      sourceLocale: config.sourceLocale,
      entityAssignments,
    });

    if (previousVersionId && changes.length > 0) {
      await writeChangeRecords({
        changes,
        documentId:    preview.documentId,
        fromVersionId: previousVersionId,
        toVersionId:   preview.versionId,
      });
    }

    await finalizeVersionImport({
      preview,
      entityMap,
      entityAssignments,
      importedAt,
    });
  } catch (error) {
    await markVersionImportFailed(preview.versionId, error);
    throw error;
  }

  return toImportResult(preview, importedAt);
}

// --- Rematch (re-generate entity assignments and change records) ---

export async function rematchDocument(documentId: string) {
  // Load all completed versions in chronological order
  const versions = await db
    .select({
      id:         DocumentVersion.id,
      versionTag: DocumentVersion.versionTag,
    })
    .from(DocumentVersion)
    .innerJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
    .where(and(
      eq(DocumentVersion.documentId, documentId),
      eq(DocumentVersionImport.importStatus, 'completed'),
    ))
    .orderBy(asc(DocumentVersion.versionTag));

  if (versions.length === 0) {
    throw new Error(`No completed versions found for document: ${documentId}`);
  }

  // Check no imports are in progress
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
    throw new Error('Cannot rematch while an import is in progress for this document');
  }

  // Phase 1: sequential matching (pure computation, in memory)
  // entityMap: nodeId -> entityId for each version
  const versionEntityMaps: Map<string, Map<string, string>> = new Map();
  const allAssignments: Map<string, Map<string, EntityAssignment>> = new Map();
  const allChanges: Array<{
    fromVersionId: string;
    toVersionId:   string;
    changes:       ChangeRecord[];
  }> = [];

  for (let i = 0; i < versions.length; i++) {
    const version = versions[i]!;

    if (i === 0) {
      // First version: all nodes get new entities, no changes
      const nodes = await loadVersionNodesAsParsed(version.id);
      const entityMap = new Map<string, string>();
      const assignments = new Map<string, EntityAssignment>();

      for (const node of nodes) {
        const entityId = randomUUID();
        entityMap.set(node.nodeId, entityId);
        assignments.set(node.nodeId, {
          entityId,
          isNew:           true,
          originVersionId: version.id,
          originNodeId:    node.nodeId,
        });
      }

      versionEntityMaps.set(version.id, entityMap);
      allAssignments.set(version.id, assignments);
      continue;
    }

    // Subsequent versions: match against previous version
    const prevVersion = versions[i - 1]!;
    const prevEntityMap = versionEntityMaps.get(prevVersion.id)!;

    const oldNodes = await loadVersionNodesForRematch(prevVersion.id, prevEntityMap);
    const newParsedNodes = await loadVersionNodesAsParsed(version.id);
    const result = matchEntities(oldNodes, newParsedNodes, version.id);

    // Build entityMap for this version
    const entityMap = new Map<string, string>();

    for (const [nodeId, assignment] of result.entityAssignments) {
      entityMap.set(nodeId, assignment.entityId);
    }

    // Nodes that weren't matched in any direction still exist — they should keep
    // an entity from assignments (matchEntities covers all nodes via added/removed)

    versionEntityMaps.set(version.id, entityMap);
    allAssignments.set(version.id, result.entityAssignments);

    allChanges.push({
      fromVersionId: prevVersion.id,
      toVersionId:   version.id,
      changes:       result.changes,
    });
  }

  // Phase 2: transactional write
  await db.transaction(async tx => {
    // Step 1: Clear all derived data for this document
    const allChangeRows = await tx
      .select({ id: DocumentNodeChange.id })
      .from(DocumentNodeChange)
      .where(eq(DocumentNodeChange.documentId, documentId));

    const changeIds = allChangeRows.map(c => c.id);

    if (changeIds.length > 0) {
      await tx.delete(DocumentChangeReview)
        .where(inArray(DocumentChangeReview.changeId, changeIds));
      await tx.delete(DocumentNodeChangeRelation)
        .where(inArray(DocumentNodeChangeRelation.changeId, changeIds));
      await tx.delete(DocumentNodeChange)
        .where(inArray(DocumentNodeChange.id, changeIds));
    }

    await tx.delete(DocumentVersionPairRevision)
      .where(eq(DocumentVersionPairRevision.documentId, documentId));

    // Step 2: Clear entity current pointers
    await tx.update(DocumentNodeEntity)
      .set({
        currentNodeRefId: null,
        currentNodeId:    null,
        currentVersionId: null,
      })
      .where(eq(DocumentNodeEntity.documentId, documentId));

    // Step 3: Collect all new entity IDs we need to insert
    const newEntityValues: Array<{
      id:               string;
      documentId:       string;
      originVersionId:  string;
      originNodeId:     string;
      currentNodeRefId: null;
      currentNodeId:    null;
      currentVersionId: null;
      totalRevisions:   number;
    }> = [];

    const allNewEntityIds = new Set<string>();

    for (const [versionId, assignments] of allAssignments) {
      for (const [, assignment] of assignments) {
        if (assignment.isNew && !allNewEntityIds.has(assignment.entityId)) {
          allNewEntityIds.add(assignment.entityId);
          newEntityValues.push({
            id:               assignment.entityId,
            documentId,
            originVersionId:  assignment.originVersionId ?? versionId,
            originNodeId:     assignment.originNodeId ?? '',
            currentNodeRefId: null,
            currentNodeId:    null,
            currentVersionId: null,
            totalRevisions:   1,
          });
        }
      }
    }

    // Step 4: Delete old entities that won't be reused, insert new ones
    // First, collect all entity IDs that are still referenced
    const referencedEntityIds = new Set<string>();

    for (const [, assignments] of allAssignments) {
      for (const [, assignment] of assignments) {
        referencedEntityIds.add(assignment.entityId);
      }
    }

    // Delete unreferenced entities
    const existingEntities = await tx
      .select({ id: DocumentNodeEntity.id })
      .from(DocumentNodeEntity)
      .where(eq(DocumentNodeEntity.documentId, documentId));

    const orphanIds = existingEntities
      .map(e => e.id)
      .filter(id => !referencedEntityIds.has(id));

    if (orphanIds.length > 0) {
      // Clear node references to orphan entities first
      await tx.update(DocumentNode)
        .set({ entityId: '' })
        .where(and(
          eq(DocumentNode.documentId, documentId),
          inArray(DocumentNode.entityId, orphanIds),
        ));

      await tx.delete(DocumentNodeEntity)
        .where(inArray(DocumentNodeEntity.id, orphanIds));
    }

    // Insert new entities
    if (newEntityValues.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < newEntityValues.length; i += batchSize) {
        await tx.insert(DocumentNodeEntity)
          .values(newEntityValues.slice(i, i + batchSize))
          .onConflictDoNothing();
      }
    }

    // Step 5: Update DocumentNode.entityId for all versions
    for (const [versionId, entityMap] of versionEntityMaps) {
      for (const [nodeId, entityId] of entityMap) {
        await tx.update(DocumentNode)
          .set({ entityId })
          .where(and(
            eq(DocumentNode.versionId, versionId),
            eq(DocumentNode.nodeId, nodeId),
          ));
      }
    }

    // Step 6: Update entity current pointers (last version's nodes win)
    const lastVersion = versions[versions.length - 1]!;
    const lastEntityMap = versionEntityMaps.get(lastVersion.id)!;
    const lastNodes = await tx
      .select({
        id:     DocumentNode.id,
        nodeId: DocumentNode.nodeId,
      })
      .from(DocumentNode)
      .where(eq(DocumentNode.versionId, lastVersion.id));

    for (const node of lastNodes) {
      const entityId = lastEntityMap.get(node.nodeId);
      if (entityId) {
        await tx.update(DocumentNodeEntity)
          .set({
            currentNodeRefId: node.id,
            currentNodeId:    node.nodeId,
            currentVersionId: lastVersion.id,
          })
          .where(eq(DocumentNodeEntity.id, entityId));
      }
    }

    // Step 7: Recalculate totalRevisions for reused entities
    // An entity appears in multiple versions if it was matched (not isNew) in later versions
    const entityRevisionCounts = new Map<string, number>();

    for (const [, assignments] of allAssignments) {
      for (const [, assignment] of assignments) {
        entityRevisionCounts.set(
          assignment.entityId,
          (entityRevisionCounts.get(assignment.entityId) ?? 0) + 1,
        );
      }
    }

    for (const [entityId, count] of entityRevisionCounts) {
      await tx.update(DocumentNodeEntity)
        .set({ totalRevisions: count })
        .where(eq(DocumentNodeEntity.id, entityId));
    }
  });

  // Phase 3: Write change records (outside the big transaction to avoid long locks)
  for (const batch of allChanges) {
    if (batch.changes.length > 0) {
      await writeChangeRecords({
        changes:       batch.changes,
        documentId,
        fromVersionId: batch.fromVersionId,
        toVersionId:   batch.toVersionId,
      });
    }
  }
}

export async function deleteDocumentVersion(versionId: string) {
  await deleteVersionGraph(versionId);
}
