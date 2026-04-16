import { gunzipSync } from 'node:zlib';

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '#db/db';
import {
  DocumentNode,
  DocumentNodeContent,
} from '#schema/magic/document';

import type { Locale } from '#model/magic/schema/basic';

interface ContentResult {
  nodeId:  string;
  content: string;
  locale:  string;
  isStale: boolean;
}

/**
 * Batch-load localized content for a list of node IDs.
 *
 * 1. Query target locale content
 * 2. For missing nodes, fall back to sourceLocale content
 * 3. Compare sourceContentHash to detect stale translations
 */
export async function getLocalizedContent(input: {
  nodeIds:      string[];
  locale:       Locale;
  sourceLocale: Locale;
}): Promise<Map<string, ContentResult>> {
  if (input.nodeIds.length === 0) {
    return new Map();
  }

  const result = new Map<string, ContentResult>();

  if (input.locale === input.sourceLocale) {
    // Same locale — just load source content directly
    const rows = await db
      .select({
        documentNodeId:    DocumentNodeContent.documentNodeId,
        content:           DocumentNodeContent.content,
        locale:            DocumentNodeContent.locale,
        sourceContentHash: DocumentNodeContent.sourceContentHash,
      })
      .from(DocumentNodeContent)
      .where(and(
        inArray(DocumentNodeContent.documentNodeId, input.nodeIds),
        eq(DocumentNodeContent.locale, input.sourceLocale),
      ));

    for (const row of rows) {
      result.set(row.documentNodeId, {
        nodeId:  row.documentNodeId,
        content: gunzipSync(Buffer.from(row.content)).toString('utf8'),
        locale:  row.locale,
        isStale: false,
      });
    }

    return result;
  }

  // Load target locale content and source content in parallel
  const [targetRows, sourceRows, nodeHashes] = await Promise.all([
    db.select({
      documentNodeId:    DocumentNodeContent.documentNodeId,
      content:           DocumentNodeContent.content,
      locale:            DocumentNodeContent.locale,
      sourceContentHash: DocumentNodeContent.sourceContentHash,
    })
      .from(DocumentNodeContent)
      .where(and(
        inArray(DocumentNodeContent.documentNodeId, input.nodeIds),
        eq(DocumentNodeContent.locale, input.locale),
      )),

    db.select({
      documentNodeId:    DocumentNodeContent.documentNodeId,
      content:           DocumentNodeContent.content,
      locale:            DocumentNodeContent.locale,
    })
      .from(DocumentNodeContent)
      .where(and(
        inArray(DocumentNodeContent.documentNodeId, input.nodeIds),
        eq(DocumentNodeContent.locale, input.sourceLocale),
      )),

    // Get current source content hash from DocumentNode for stale detection
    db.select({
      id:                DocumentNode.id,
      sourceContentHash: DocumentNode.sourceContentHash,
    })
      .from(DocumentNode)
      .where(inArray(DocumentNode.id, input.nodeIds)),
  ]);

  const currentHashMap = new Map(
    nodeHashes.map(n => [n.id, n.sourceContentHash]),
  );

  const sourceContentMap = new Map(
    sourceRows.map(r => [r.documentNodeId, r]),
  );

  // Use target locale content where available
  for (const row of targetRows) {
    const currentHash = currentHashMap.get(row.documentNodeId);
    const isStale = currentHash != null && row.sourceContentHash !== currentHash;

    result.set(row.documentNodeId, {
      nodeId:  row.documentNodeId,
      content: gunzipSync(Buffer.from(row.content)).toString('utf8'),
      locale:  row.locale,
      isStale,
    });
  }

  // Fall back to source locale for missing nodes
  for (const nodeId of input.nodeIds) {
    if (result.has(nodeId)) continue;

    const source = sourceContentMap.get(nodeId);
    if (source) {
      result.set(nodeId, {
        nodeId,
        content: gunzipSync(Buffer.from(source.content)).toString('utf8'),
        locale:  source.locale,
        isStale: false,
      });
    }
  }

  return result;
}
