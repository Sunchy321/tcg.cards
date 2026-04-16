import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';

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

function generateHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function normalizeFingerprint(content: string): string {
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
  preview:      DocumentPreview;
  sourceLocale: 'en' | 'zhs' | 'zht' | 'ja' | 'ko';
}) {
  const entityValues = input.preview.nodes.map(node => ({
    id:               randomUUID(),
    documentId:       input.preview.documentId,
    originVersionId:  input.preview.versionId,
    originNodeId:     node.nodeId,
    currentNodeRefId: null,
    currentNodeId:    null,
    currentVersionId: null,
    totalRevisions:   1,
  }));
  const entityMap = new Map(entityValues.map((entity, index) => [input.preview.nodes[index]!.nodeId, entity.id]));

  await db.transaction(async tx => {
    if (entityValues.length > 0) {
      await tx.insert(DocumentNodeEntity).values(entityValues);
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
  preview:    DocumentPreview;
  entityMap:  Map<string, string>;
  importedAt: Date;
}) {
  await db.transaction(async tx => {
    for (const node of input.preview.nodes) {
      await tx.update(DocumentNodeEntity)
        .set({
          currentNodeRefId: node.id,
          currentNodeId:    node.nodeId,
          currentVersionId: input.preview.versionId,
        })
        .where(eq(DocumentNodeEntity.id, input.entityMap.get(node.nodeId)!));
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

    const entityMap = await writeVersionSnapshot({
      preview,
      sourceLocale: config.sourceLocale,
    });

    await finalizeVersionImport({
      preview,
      entityMap,
      importedAt,
    });
  } catch (error) {
    await markVersionImportFailed(preview.versionId, error);
    throw error;
  }

  return toImportResult(preview, importedAt);
}

export async function deleteDocumentVersion(versionId: string) {
  await deleteVersionGraph(versionId);
}
