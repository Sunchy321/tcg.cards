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
      ),
    )
    .orderBy(RuleSource.effectiveDate)
    .limit(1);

  // This is a simplified version - in production, compare dates properly
  return result[0];
}

/**
 * Check if entity exists by ID
 */
async function findEntityById(entityId: string): Promise<{ id: string } | undefined> {
  const result = await db
    .select({ id: RuleEntity.id })
    .from(RuleEntity)
    .where(eq(RuleEntity.id, entityId))
    .limit(1);

  return result[0];
}

/**
 * Create a new entity for a rule
 */
async function createEntity(node: ParsedRuleNode): Promise<string> {
  const entityId = `${node.sourceId}-${node.nodeId}`;

  console.log(`[createEntity] node.id=${node.id}, nodeId=${node.nodeId}, generated entityId=${entityId}`);

  // Check if entity already exists (from partial import)
  const existing = await findEntityById(entityId);
  if (existing) {
    console.log(`[createEntity] Entity ${entityId} already exists, updating instead`);
    // Update existing entity to point to new version
    await db
      .update(RuleEntity)
      .set({
        currentNodeId:   node.id,
        currentRuleId:   node.nodeId,
        currentSourceId: node.sourceId,
        totalRevisions:  1, // Reset as this is a re-import scenario
      })
      .where(eq(RuleEntity.id, entityId));
    return entityId;
  }

  console.log(`[createEntity] Inserting new entity: ${entityId}`);
  try {
    await db.insert(RuleEntity).values({
      id:              entityId,
      currentNodeId:   node.id,
      currentRuleId:   node.nodeId,
      currentSourceId: node.sourceId,
      totalRevisions:  1,
    });
  } catch (err) {
    console.error(`[createEntity] Failed to insert entity ${entityId}:`, err);
    throw err;
  }

  return entityId;
}

/**
 * Update entity to point to new version
 */
async function updateEntity(entityId: string, node: ParsedRuleNode): Promise<void> {
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
  previousVersionId?: string,
): Promise<string> {
  // Try to find existing entity from previous version
  if (previousVersionId) {
    const previousNodeId = `${previousVersionId}/${node.nodeId}`;
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

  // Create new entity (handles conflict internally)
  return createEntity(node);
}

/**
 * Insert a rule node
 */
async function insertRuleNode(node: ParsedRuleNode, entityId: string): Promise<void> {
  await db.insert(RuleNode).values({
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
  // DEBUG: Log source info
  console.log(`[Import] Source ID: ${source.id}, totalRules: ${source.totalRules}, nodes count: ${source.nodes.length}`);
  console.log(`[Import] First 3 nodes:`, source.nodes.slice(0, 3).map(n => ({ id: n.id, nodeId: n.nodeId, level: n.level })));

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
    console.log(`[Import] Previous version:`, previousVersion?.id ?? 'none');

    // 4. Create entities and nodes
    const entityMap = new Map<string, string>();
    const entityIdSet = new Set<string>(); // DEBUG: track unique entity IDs
    let newEntities = 0;
    let existingEntities = 0;

    for (let i = 0; i < source.nodes.length; i++) {
      const node = source.nodes[i]!;
      const entityId = await getOrCreateEntity(node, previousVersion?.id);

      // DEBUG: Check for duplicate entity IDs
      if (entityIdSet.has(entityId)) {
        console.error(`[Import] DUPLICATE entityId detected: ${entityId} for node ${node.id} (index ${i})`);
      } else {
        entityIdSet.add(entityId);
      }

      // DEBUG: Log first few and any problematic nodes
      if (i < 5 || i === source.nodes.length - 1) {
        console.log(`[Import] Node ${i}: id=${node.id}, nodeId=${node.nodeId}, entityId=${entityId}`);
      }

      entityMap.set(node.id, entityId);

      if (entityId.startsWith(source.id)) {
        newEntities++;
      } else {
        existingEntities++;
      }

      await insertRuleNode(node, entityId);
    }

    console.log(`[Import] Unique entity IDs: ${entityIdSet.size}, Total nodes: ${source.nodes.length}`);

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
      const previousNodes = await tx
        .select()
        .from(RuleNode)
        .where(eq(RuleNode.sourceId, previousVersion.id));

      const oldNodes: ParsedRuleNode[] = previousNodes.map(n => ({
        id:          n.id,
        sourceId:    n.sourceId,
        nodeId:      n.ruleId,
        path:        n.path,
        level:       n.level,
        parentId:    n.parentId,
        title:       n.title,
        content:     '',
        contentHash: n.contentHash,
      }));

      const { matches, splits, merges } = detectChanges(oldNodes, source.nodes);

      for (const match of matches) {
        const entityId = match.newNodeId
          ? entityMap.get(match.newNodeId)
          : match.oldNodeId
            ? entityMap.get(match.oldNodeId)
            : undefined;

        if (entityId) {
          await recordChange(previousVersion.id, source.id, match, entityId);
        }

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

      for (const split of splits) {
        await recordSplitChange(previousVersion.id, source.id, split, entityMap);
        changeCounts.split++;
      }

      for (const merge of merges) {
        await recordMergeChange(previousVersion.id, source.id, merge, entityMap);
        changeCounts.merged++;
      }

      await tx
        .update(RuleSource)
        .set({ status: 'superseded' })
        .where(eq(RuleSource.id, previousVersion.id));
    } else {
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
    await tx.delete(RuleChange).where(eq(RuleChange.toSourceId, source.id));
    await tx.delete(RuleNode).where(eq(RuleNode.sourceId, source.id));
    await tx.delete(RuleSource).where(eq(RuleSource.id, source.id));

    return importRuleVersion(source, contents, options);
  });
}
