import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { ParsedRuleNode, ParsedRuleSource, CompressedContent } from '#server/lib/magic/rule/parser';
import type { ChangeType, MatchResult, SplitResult, MergeResult } from '#server/lib/magic/rule/matcher';
import { detectChanges } from '#server/lib/magic/rule/matcher';

import type { RuleContent as IRuleContent } from '#model/magic/schema/rule';

import { db } from '#db/db';
import type * as schema from '#schema';
import { RuleSource, RuleContent, RuleEntity, RuleNode, RuleChange } from '#schema/magic/rule';

type DatabaseClient = NodePgDatabase<typeof schema>;

export interface ImportResult {
  sourceId:         string;
  totalNodes:       number;
  newEntities:      number;
  existingEntities: number;
  changes: {
    added:    number;
    removed:  number;
    modified: number;
    renamed:  number;
    moved:    number;
    split:    number;
    merged:   number;
  };
}

/**
 * Check if a rule content already exists
 */
async function getExistingContent(hash: string, tx: DatabaseClient): Promise<IRuleContent | undefined> {
  const result = await tx
    .select()
    .from(RuleContent)
    .where(eq(RuleContent.hash, hash))
    .limit(1);

  return result[0]!;
}

/**
 * Insert or update rule content (reference counting)
 */
async function upsertRuleContent(content: CompressedContent, tx: DatabaseClient): Promise<void> {
  const existing = await getExistingContent(content.hash, tx);

  if (existing) {
    // Increment reference count
    await tx
      .update(RuleContent)
      .set({ refCount: existing.refCount + 1 })
      .where(eq(RuleContent.hash, content.hash));
  } else {
    // Insert new content
    await tx.insert(RuleContent).values({
      hash:     content.hash,
      content:  content.content,
      size:     content.size,
      refCount: 1,
    });
  }
}

/**
 * Get the previous version (by effective date)
 */
async function getPreviousVersion(
  currentSourceId: string,
  tx: DatabaseClient,
): Promise<{ id: string, effectiveDate: string | null } | undefined> {
  const current = await tx
    .select()
    .from(RuleSource)
    .where(eq(RuleSource.id, currentSourceId))
    .limit(1);

  if (!current[0]?.effectiveDate) return undefined;

  const currentDate = current[0].effectiveDate;

  const result = await tx
    .select({
      id:            RuleSource.id,
      effectiveDate: RuleSource.effectiveDate,
    })
    .from(RuleSource)
    .where(
      and(
        eq(RuleSource.status, 'active'),
        // Effective date is before current date
        // Using string comparison for YYYY-MM-DD format
      ),
    )
    .orderBy(RuleSource.effectiveDate)
    .limit(1);

  // Filter out versions with effective date >= current date
  return result.find(r => r.effectiveDate && r.effectiveDate < currentDate);
}

/**
 * Create a new entity for a rule
 */
async function createEntity(
  node: ParsedRuleNode,
  tx: DatabaseClient,
): Promise<string> {
  const entityId = `${node.sourceId}-${node.nodeId}`;

  await tx.insert(RuleEntity).values({
    id:              entityId,
    currentNodeId:   node.id,
    currentRuleId:   node.nodeId,
    currentSourceId: node.sourceId,
    totalRevisions:  1,
  });

  return entityId;
}

/**
 * Update entity to point to new version
 */
async function updateEntity(
  entityId: string,
  node: ParsedRuleNode,
  tx: DatabaseClient,
): Promise<void> {
  const entity = await tx
    .select()
    .from(RuleEntity)
    .where(eq(RuleEntity.id, entityId))
    .limit(1);

  if (!entity[0]) return;

  await tx
    .update(RuleEntity)
    .set({
      currentNodeId:   node.id,
      currentRuleId:   node.nodeId,
      currentSourceId: node.sourceId,
      totalRevisions:  entity[0].totalRevisions + 1,
    })
    .where(eq(RuleEntity.id, entityId));
}

/**
 * Get or create entity for a rule node
 */
async function getOrCreateEntity(
  node: ParsedRuleNode,
  tx: DatabaseClient,
  previousVersionId?: string,
): Promise<string> {
  // Try to find existing entity from previous version
  if (previousVersionId) {
    const previousNodeId = `${previousVersionId}/${node.nodeId}`;
    const previousNode = await tx
      .select({ entityId: RuleNode.entityId })
      .from(RuleNode)
      .where(eq(RuleNode.id, previousNodeId))
      .limit(1);

    if (previousNode[0]) {
      await updateEntity(previousNode[0].entityId, node, tx);
      return previousNode[0].entityId;
    }
  }

  // Create new entity
  return createEntity(node, tx);
}

/**
 * Insert a rule node
 */
async function insertRuleNode(
  node: ParsedRuleNode,
  entityId: string,
  tx: DatabaseClient,
): Promise<void> {
  await tx.insert(RuleNode).values({
    id:          node.id,
    sourceId:    node.sourceId,
    ruleId:      node.nodeId,
    path:        node.path,
    level:       node.level,
    parentId:    node.parentId,
    title:       node.title,
    contentHash: node.contentHash,
    entityId,
  });
}

/**
 * Record a change between versions
 */
async function recordChange(
  fromSourceId: string,
  toSourceId: string,
  match: MatchResult,
  entityId: string,
  tx: DatabaseClient,
): Promise<void> {
  if (match.type === 'unchanged') return;

  const details: Record<string, unknown> = {};

  if (match.details) {
    if (match.details.oldContentHash && match.details.newContentHash) {
      details.oldContentHash = match.details.oldContentHash;
      details.newContentHash = match.details.newContentHash;
    }

    if (match.details.oldRuleId && match.details.newRuleId) {
      details.oldRuleId = match.details.oldRuleId;
      details.newRuleId = match.details.newRuleId;
    }

    details.similarityScore = match.similarity;
  }

  await tx.insert(RuleChange).values({
    id:         randomUUID(),
    fromSourceId,
    toSourceId,
    entityId,
    fromNodeId: match.oldNodeId,
    toNodeId:   match.newNodeId,
    type:       match.type as ChangeType,
    details:    JSON.stringify(details),
  });
}

/**
 * Record a split change
 */
async function recordSplitChange(
  fromSourceId: string,
  toSourceId: string,
  split: SplitResult,
  entityMap: Map<string, string>, // nodeId -> entityId
  tx: DatabaseClient,
): Promise<void> {
  const entityId = entityMap.get(`${toSourceId}/${split.fromRuleId}`) || randomUUID();

  await tx.insert(RuleChange).values({
    id:         randomUUID(),
    fromSourceId,
    toSourceId,
    entityId,
    fromNodeId: `${fromSourceId}/${split.fromRuleId}`,
    toNodeId:   null,
    type:       'split',
    details:    JSON.stringify({
      splitInto:       split.intoRuleIds,
      splitRatios:     split.similarities,
      totalSimilarity: split.totalSimilarity,
    }),
  });
}

/**
 * Record a merge change
 */
async function recordMergeChange(
  fromSourceId: string,
  toSourceId: string,
  merge: MergeResult,
  entityMap: Map<string, string>,
  tx: DatabaseClient,
): Promise<void> {
  const entityId = entityMap.get(`${toSourceId}/${merge.intoRuleId}`) || randomUUID();

  await tx.insert(RuleChange).values({
    id:         randomUUID(),
    fromSourceId,
    toSourceId,
    entityId,
    fromNodeId: null,
    toNodeId:   `${toSourceId}/${merge.intoRuleId}`,
    type:       'merged',
    details:    JSON.stringify({
      mergedFrom:      merge.fromRuleIds,
      similarities:    merge.similarities,
      totalSimilarity: merge.totalSimilarity,
    }),
  });
}

/**
 * Import rule version implementation (internal, accepts transaction)
 */
async function importRuleVersionImpl(
  source: ParsedRuleSource,
  contents: CompressedContent[],
  options: {
    txtUrl?:      string;
    pdfUrl?:      string;
    docxUrl?:     string;
    publishedAt?: string;
  } = {},
  tx: DatabaseClient,
): Promise<ImportResult> {
  // 1. Insert rule source
  await tx.insert(RuleSource).values({
    id:            source.id,
    effectiveDate: source.effectiveDate,
    publishedAt:   options.publishedAt || source.publishedAt,
    txtUrl:        options.txtUrl,
    pdfUrl:        options.pdfUrl,
    docxUrl:       options.docxUrl,
    totalRules:    source.totalRules,
    status:        'active',
  });

  // 2. Insert compressed content
  for (const content of contents) {
    await upsertRuleContent(content, tx);
  }

  // 3. Get previous version for change detection
  const previousVersion = await getPreviousVersion(source.id, tx);

  // 4. Create entities and nodes
  const entityMap = new Map<string, string>(); // nodeId -> entityId
  let newEntities = 0;
  let existingEntities = 0;

  for (const node of source.nodes) {
    const entityId = await getOrCreateEntity(node, tx, previousVersion?.id);
    entityMap.set(node.id, entityId);

    if (entityId.startsWith(source.id)) {
      newEntities++;
    } else {
      existingEntities++;
    }

    await insertRuleNode(node, entityId, tx);
  }

  // 5. Detect and record changes
  const changeCounts = {
    added:    0,
    removed:  0,
    modified: 0,
    renamed:  0,
    moved:    0,
    split:    0,
    merged:   0,
  };

  if (previousVersion) {
    // Fetch previous version nodes
    const previousNodes = await tx
      .select()
      .from(RuleNode)
      .where(eq(RuleNode.sourceId, previousVersion.id));

    // Convert to ParsedRuleNode format for comparison
    const oldNodes: ParsedRuleNode[] = previousNodes.map(n => ({
      id:          n.id,
      sourceId:    n.sourceId,
      nodeId:      n.ruleId,
      path:        n.path,
      level:       n.level,
      parentId:    n.parentId,
      title:       n.title,
      content:     '', // We don't have content here, but we have hash
      contentHash: n.contentHash,
    }));

    const { matches, splits, merges } = detectChanges(oldNodes, source.nodes);

    // Record regular changes
    for (const match of matches) {
      const entityId = match.newNodeId
        ? entityMap.get(match.newNodeId)
        : match.oldNodeId
          ? entityMap.get(match.oldNodeId)
          : undefined;

      if (entityId) {
        await recordChange(previousVersion.id, source.id, match, entityId, tx);
      }

      // Count changes by type
      switch (match.type) {
      case 'added':
        changeCounts.added++;
        break;
      case 'removed':
        changeCounts.removed++;
        break;
      case 'modified':
        changeCounts.modified++;
        break;
      case 'renamed':
      case 'renamed_modified':
        changeCounts.renamed++;
        break;
      case 'moved':
        changeCounts.moved++;
        break;
      }
    }

    // Record splits
    for (const split of splits) {
      await recordSplitChange(previousVersion.id, source.id, split, entityMap, tx);
      changeCounts.split++;
    }

    // Record merges
    for (const merge of merges) {
      await recordMergeChange(previousVersion.id, source.id, merge, entityMap, tx);
      changeCounts.merged++;
    }

    // Mark previous version as superseded
    await tx
      .update(RuleSource)
      .set({ status: 'superseded' })
      .where(eq(RuleSource.id, previousVersion.id));
  } else {
    // First version - all are additions
    changeCounts.added = source.nodes.length;
  }

  return {
    sourceId:   source.id,
    totalNodes: source.totalRules,
    newEntities,
    existingEntities,
    changes:    changeCounts,
  };
}

/**
 * Import a new rule version
 *
 * This function:
 * 1. Creates the rule source entry
 * 2. Inserts compressed content (with deduplication)
 * 3. Creates/updates rule entities
 * 4. Creates rule nodes
 * 5. Detects and records changes from previous version
 */
export async function importRuleVersion(
  source: ParsedRuleSource,
  contents: CompressedContent[],
  options: {
    txtUrl?:      string;
    pdfUrl?:      string;
    docxUrl?:     string;
    publishedAt?: string;
  } = {},
): Promise<ImportResult> {
  return await db.transaction(async tx => {
    return importRuleVersionImpl(source, contents, options, tx);
  });
}

/**
 * Reimport a rule version (for corrections)
 *
 * This deletes the existing data and reimports it.
 * Use with caution - only for fixing import errors.
 */
export async function reimportRuleVersion(
  source: ParsedRuleSource,
  contents: CompressedContent[],
  options: {
    txtUrl?:      string;
    pdfUrl?:      string;
    docxUrl?:     string;
    publishedAt?: string;
  } = {},
): Promise<ImportResult> {
  return await db.transaction(async tx => {
    // 1. Delete existing data for this version
    await tx.delete(RuleChange).where(eq(RuleChange.toSourceId, source.id));
    await tx.delete(RuleNode).where(eq(RuleNode.sourceId, source.id));
    await tx.delete(RuleSource).where(eq(RuleSource.id, source.id));

    // Note: We don't delete entities or content as they may be referenced by other versions

    // 2. Reimport using the same transaction
    return importRuleVersionImpl(source, contents, options, tx);
  });
}
