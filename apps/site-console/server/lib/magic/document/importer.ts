import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '#db/db';
import {
  DocumentDefinition,
  DocumentNode,
  DocumentNodeContent,
  DocumentNodeEntity,
  DocumentVersion,
  DocumentVersionImport,
} from '#schema/magic/document';

import { getDocumentConfig } from './config';
import { parseMagicCrDocument, type ParsedDocumentNode } from './parser';

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
    heading: nodes.filter(node => node.nodeKind === 'heading').length,
    term:    nodes.filter(node => node.nodeKind === 'term').length,
    content: nodes.filter(node => node.nodeKind === 'content').length,
    example: nodes.filter(node => node.nodeKind === 'example').length,
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

async function deleteVersionGraph(versionId: string) {
  return await db.transaction(async tx => {
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
          eq(DocumentNodeEntity.originVersionId, versionId),
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

    await tx.delete(DocumentVersionImport)
      .where(eq(DocumentVersionImport.versionId, versionId));

    await tx.delete(DocumentVersion)
      .where(eq(DocumentVersion.id, versionId));
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

  await ensureDocumentDefinition(preview.documentId);
  await deleteVersionGraph(preview.versionId);

  const importRunId = randomUUID();
  const importedAt = new Date();
  const sourceFileHash = generateHash(normalizeDocumentText(input.content));
  const normalizedContentVersion = 'magic-document-fingerprint-v1';
  const effectiveDate = preview.effectiveDate ?? versionTagToDate(preview.versionTag);
  const publishedAt = preview.publishedAt ?? effectiveDate;

  return await db.transaction(async tx => {
    await tx.update(DocumentVersion)
      .set({ lifecycleStatus: 'superseded' })
      .where(and(
        eq(DocumentVersion.documentId, preview.documentId),
        eq(DocumentVersion.lifecycleStatus, 'active'),
      ));

    await tx.insert(DocumentVersion).values({
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
    });

    await tx.insert(DocumentVersionImport).values({
      versionId:     preview.versionId,
      sourceFileHash,
      parserVersion: config.parserStrategy,
      normalizedContentVersion,
      importRunId,
      importedAt:    null,
      importStatus:  'processing',
      importError:   null,
    });

    const entityValues = preview.nodes.map(node => ({
      id:               randomUUID(),
      documentId:       preview.documentId,
      originVersionId:  preview.versionId,
      originNodeId:     node.nodeId,
      currentNodeRefId: null,
      currentNodeId:    null,
      currentVersionId: null,
      totalRevisions:   1,
    }));

    if (entityValues.length > 0) {
      await tx.insert(DocumentNodeEntity).values(entityValues);
    }

    const entityMap = new Map(entityValues.map((entity, index) => [preview.nodes[index]!.nodeId, entity.id]));

    const nodeValues = preview.nodes.map(node => ({
      id:                    node.id,
      versionId:             preview.versionId,
      documentId:            preview.documentId,
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

    for (const node of preview.nodes) {
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
        locale:            config.sourceLocale,
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

    for (const node of preview.nodes) {
      await tx.update(DocumentNodeEntity)
        .set({
          currentNodeRefId: node.id,
          currentNodeId:    node.nodeId,
          currentVersionId: preview.versionId,
        })
        .where(eq(DocumentNodeEntity.id, entityMap.get(node.nodeId)!));
    }

    await tx.update(DocumentVersionImport)
      .set({
        importStatus: 'completed',
        importedAt,
        importError:  null,
      })
      .where(eq(DocumentVersionImport.versionId, preview.versionId));

    return {
      documentId:    preview.documentId,
      versionId:     preview.versionId,
      versionTag:    preview.versionTag,
      effectiveDate: preview.effectiveDate,
      totalNodes:    preview.nodes.length,
      summary:       preview.summary,
      importedAt,
    };
  });
}

export async function deleteDocumentVersion(versionId: string) {
  await deleteVersionGraph(versionId);
}
