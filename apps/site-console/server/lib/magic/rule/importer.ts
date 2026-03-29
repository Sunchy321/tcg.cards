import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

import type { ParsedRuleNode, ParsedRuleSource, CompressedContent } from '#server/lib/magic/rule/parser';
import type { ChangeType, MatchResult, SplitResult, MergeResult } from '#server/lib/magic/rule/matcher';
import { detectChanges } from '#server/lib/magic/rule/matcher';

import type { RuleContent as IRuleContent } from '#model/magic/schema/rule';

import { db } from '#db/db';
import { RuleSource, RuleContent, RuleEntity, RuleNode, RuleChange } from '#schema/magic/rule';

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
async function getExistingContent(hash: string): Promise<IRuleContent | undefined> {
  const result = await db
    .select()
    .from(RuleContent)
    .where(eq(RuleContent.hash, hash))
    .limit(1);

  return result[0]!;
}

/**
 * Insert or update rule content (reference counting)
 */
async function upsertRuleContent(content: CompressedContent): Promise<void> {
  const existing = await getExistingContent(content.hash);

  if (existing) {
    // Increment reference count
    await db
      .update(RuleContent)
      .set({ refCount: existing.refCount + 1 })
      .where(eq(RuleContent.hash, content.hash));
  } else {
    // Insert new content
    await db.insert(RuleContent).values({
      hash:     content.hash,
      content:  content.content,
      size:     content.size,
      refCount: 1,
    });
  }
}

/**
 * Find existing entity by current node ID
 */
async function findEntityByNodeId(sourceId: string, ruleId: string): Promise<{ id: string } | undefined> {
  const nodeId = `${sourceId}/${ruleId}`;

  // First check if there's a node in the previous version
  const previousVersion = await getPreviousVersion(sourceId);
  if (!previousVersion) return undefined;

  const previousNodeId = `${previousVersion.id}/${ruleId}`;

  const result = await db
    .select({ entityId: RuleNode.entityId })
    .from(RuleNode)
    .where(eq(RuleNode.id, previousNodeId))
    .limit(1);

  if (result[0]) {
    return { id: result[0].entityId };
  }

  return undefined;
}

/**
 * Get the previous version (by effective date)
 */
async function getPreviousVersion(

  currentSourceId: string,
): Promise<{ id: string, effectiveDate: string | null } | undefined> {
  const current = await db
    .select()
    .from(RuleSource)
    .where(eq(RuleSource.id, currentSourceId))
    .limit(1);

  if (!current[0]?.effectiveDate) return undefined;

  const result = await db
    .select({
      id:            RuleSource.id,
      effectiveDate: RuleSource.effectiveDate,
    })
    .from(RuleSource)
    .where(
      and(
        eq(RuleSource.status, 'active'),
        // Effective date is before current
      ),
    )
    .orderBy(RuleSource.effectiveDate)
    .limit(1);

  // This is a simplified version - in production, compare dates properly
  return result[0];
}

/**
 * Create a new entity for a rule
 */
async function createEntity(

  node: ParsedRuleNode,
): Promise<string> {
  const entityId = `${node.sourceId}-${node.ruleId}`;

  await db.insert(RuleEntity).values({
    id:              entityId,
    currentNodeId:   node.id,
    currentRuleId:   node.ruleId,
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
): Promise<void> {
  const entity = await db
    .select()
    .from(RuleEntity)
    .where(eq(RuleEntity.id, entityId))
    .limit(1);

  if (!entity[0]) return;

  await db
    .update(RuleEntity)
    .set({
      currentNodeId:   node.id,
      currentRuleId:   node.ruleId,
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
  previousVersionId?: string,
): Promise<string> {
  // Try to find existing entity from previous version
  if (previousVersionId) {
    const previousNodeId = `${previousVersionId}/${node.ruleId}`;
    const previousNode = await db
      .select({ entityId: RuleNode.entityId })
      .from(RuleNode)
      .where(eq(RuleNode.id, previousNodeId))
      .limit(1);

    if (previousNode[0]) {
      await updateEntity(previousNode[0].entityId, node);
      return previousNode[0].entityId;
    }
  }

  // Create new entity
  return createEntity(node);
}

/**
 * Insert a rule node
 */
async function insertRuleNode(

  node: ParsedRuleNode,
  entityId: string,
): Promise<void> {
  await db.insert(RuleNode).values({
    id:          node.id,
    sourceId:    node.sourceId,
    ruleId:      node.ruleId,
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

  await db.insert(RuleChange).values({
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
): Promise<void> {
  const entityId = entityMap.get(`${toSourceId}/${split.fromRuleId}`) || randomUUID();

  await db.insert(RuleChange).values({
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
): Promise<void> {
  const entityId = entityMap.get(`${toSourceId}/${merge.intoRuleId}`) || randomUUID();

  await db.insert(RuleChange).values({
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
      await upsertRuleContent(content);
    }

    // 3. Get previous version for change detection
    const previousVersion = await getPreviousVersion(source.id);

    // 4. Create entities and nodes
    const entityMap = new Map<string, string>(); // nodeId -> entityId
    let newEntities = 0;
    let existingEntities = 0;

    for (const node of source.nodes) {
      const entityId = await getOrCreateEntity(node, previousVersion?.id);
      entityMap.set(node.id, entityId);

      if (entityId.startsWith(source.id)) {
        newEntities++;
      } else {
        existingEntities++;
      }

      await insertRuleNode(node, entityId);
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
        ruleId:      n.ruleId,
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
          await recordChange(previousVersion.id, source.id, match, entityId);
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
        await recordSplitChange(previousVersion.id, source.id, split, entityMap);
        changeCounts.split++;
      }

      // Record merges
      for (const merge of merges) {
        await recordMergeChange(previousVersion.id, source.id, merge, entityMap);
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

    // 2. Reimport
    return importRuleVersion(source, contents, options);
  });
}
