import { createHash, randomUUID } from 'node:crypto';

import type { NodeChangeDetails, NodeChangeReviewStateCache, NodeChangeType } from '@tcg-cards/model/magic/schema/document';
import type { ParsedDocumentNode } from './parser';
import type { Revision } from './store';
import { excludeInsertedNumbering } from './renumbering';

/** Fingerprint exact readable content without importing persistence code. */
function generateHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Ignore punctuation and spacing for matching otherwise equivalent text. */
function normalizeFingerprint(content: string): string {
  return content.toLowerCase().replace(/[.,;:!?()[\]{}'"“”‘’]/g, '').replace(/\s+/g, ' ').trim();
}

/** Adapt immutable revision nodes into stable identities for the matching algorithm. */
export function matchRevisionNodes(previous: Revision | null, parsed: ParsedDocumentNode[], revisionId: string): MatchResult {
  return matchEntities((previous?.nodes ?? []).map(node => ({
    id: node.id, nodeId: node.anchor ?? node.nodeKey, nodeKind: node.kind,
    path: node.path, level: node.level, parentNodeId: node.parentId, siblingOrder: node.siblingOrder,
    sourceContentHash: node.rawText ? generateHash(node.rawText) : null,
    sourceFingerprintHash: node.rawText ? generateHash(normalizeFingerprint(node.rawText)) : null,
    entityId: node.nodeKey, content: node.rawText,
  })), parsed, revisionId);
}

// --- Types ---

/** Retain prior content and its stable identity for matching. */
export interface OldNode {
  id:                    string;
  nodeId:                string;
  nodeKind:              string;
  path:                  string;
  level:                 number;
  parentNodeId:          string | null;
  siblingOrder:          number;
  sourceContentHash:     string | null;
  sourceFingerprintHash: string | null;
  entityId:              string;
  content:               string | null;
}

/** Precompute matching fingerprints for incoming content. */
interface NewNode {
  id:              string;
  nodeId:          string;
  nodeKind:        string;
  path:            string;
  level:           number;
  parentNodeId:    string | null;
  content:         string | null;
  contentHash:     string | null;
  fingerprintHash: string | null;
}

/** Associate incoming nodes with stable identities. */
export interface EntityAssignment {
  entityId:         string;
  isNew:            boolean;
  originVersionId?: string;
  originNodeId?:    string;
}

/** Preserve every source and destination in split or merge changes. */
export interface ChangeRelation {
  side:      'from' | 'to';
  entityId:  string | null;
  nodeRefId: string | null;
  nodeId:    string | null;
  weight:    number | null;
  sortOrder: number;
}

/** Describe one classified structural or textual change. */
export interface ChangeRecord {
  entityId:          string | null;
  fromNodeRefId:     string | null;
  toNodeRefId:       string | null;
  type:              NodeChangeType;
  confidenceScore:   number;
  details:           NodeChangeDetails;
  reviewStateCache?: NodeChangeReviewStateCache;
  relations?:        ChangeRelation[];
}

/** Return stable node assignments and their classified differences. */
export interface MatchResult {
  entityAssignments: Map<string, EntityAssignment>;
  changes:           ChangeRecord[];
}

// --- Similarity Functions ---

/** Normalize words for overlap scoring. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/** Measure shared vocabulary independently of repeated words. */
function diceSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);

  if (tokens1.length === 0 && tokens2.length === 0) return 1;
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  const intersection = [...set1].filter(t => set2.has(t)).length;

  return (2 * intersection) / (set1.size + set2.size);
}

/** Collect character trigrams for local similarity. */
function generateTrigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const trigrams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.slice(i, i + 3));
  }
  return trigrams;
}

/** Measure shared character trigrams. */
function trigramSimilarity(text1: string, text2: string): number {
  const trigrams1 = generateTrigrams(text1);
  const trigrams2 = generateTrigrams(text2);

  if (trigrams1.size === 0 && trigrams2.size === 0) return 1;
  if (trigrams1.size === 0 || trigrams2.size === 0) return 0;

  const intersection = [...trigrams1].filter(t => trigrams2.has(t)).length;
  const union = new Set([...trigrams1, ...trigrams2]).size;

  return intersection / union;
}

// --- Structure Helpers ---

/** Extract the structural rule prefix. */
function getChapter(nodeId: string): string {
  // Rule nodeIds: "702.1a" -> chapter "702", section "702"
  // But chapters are like "1", "2", ..., "9" (single digit)
  // Sections are like "100", "200", "702"
  // Rules are like "702.1", "702.1a"
  // Glossary: "glossary.term"
  // Meta: "meta.intro", "meta.credits"
  const dotIndex = nodeId.indexOf('.');
  if (dotIndex === -1) return nodeId;
  return nodeId.slice(0, dotIndex);
}

/** Select a structural ancestor path. */
function getPathPrefix(path: string, depth: number): string {
  return path.split('/').slice(0, depth).join('/');
}

/** Detect nodes sharing nearby ancestry. */
function isNearbyPath(path1: string, path2: string): boolean {
  const parts1 = path1.split('/');
  const parts2 = path2.split('/');
  const minLen = Math.min(parts1.length, parts2.length);
  if (minLen === 0) return false;

  let shared = 0;
  for (let i = 0; i < minLen; i++) {
    if (parts1[i] === parts2[i]) {
      shared++;
    } else {
      break;
    }
  }

  // Nearby if shared prefix is at least half the shorter path
  return shared >= Math.ceil(minLen / 2);
}

/** Detect movement between top-level chapters. */
function isSignificantPathChange(path1: string, path2: string): boolean {
  // Different top-level chapter
  return getPathPrefix(path1, 1) !== getPathPrefix(path2, 1);
}

/** Prefer structurally nearby matching candidates. */
function structureBonus(oldNode: OldNode, newNode: { nodeKind: string, path: string, level: number, parentNodeId: string | null }): number {
  // Same parent node gives highest bonus
  if (oldNode.parentNodeId && oldNode.parentNodeId === newNode.parentNodeId) return 1.0;
  // Same chapter
  if (getPathPrefix(oldNode.path, 1) === getPathPrefix(newNode.path, 1)) return 0.7;
  // Nearby path
  if (isNearbyPath(oldNode.path, newNode.path)) return 0.5;
  return 0.0;
}

/** Combine lexical, character, and structural similarity. */
function scoreCandidate(oldText: string, newText: string, bonus: number): number {
  const dice = diceSimilarity(oldText, newText);
  const trigram = trigramSimilarity(oldText, newText);
  return dice * 0.45 + trigram * 0.40 + bonus * 0.15;
}

// --- Change Classification ---

/** Classify a matched pair by content and structural movement. */
function classifyChange(
  oldNode: OldNode,
  newNode: NewNode,
  matchStage: 'nodeId' | 'content' | 'fingerprint' | 'similarity',
  score: number,
): { type: NodeChangeType, details: NodeChangeDetails } {
  const sameNodeId = oldNode.nodeId === newNode.nodeId;

  if (matchStage === 'nodeId') {
    // Same nodeId, different content
    return {
      type:    'modified',
      details: {
        oldContentHash: oldNode.sourceContentHash ?? undefined,
        newContentHash: newNode.contentHash ?? undefined,
        oldNodeId:      oldNode.nodeId,
        newNodeId:      newNode.nodeId,
        oldPath:        oldNode.path,
        newPath:        newNode.path,
      },
    };
  }

  if (matchStage === 'content') {
    // Same content, different nodeId
    if (isSignificantPathChange(oldNode.path, newNode.path)) {
      return {
        type:    'moved',
        details: {
          oldNodeId: oldNode.nodeId,
          newNodeId: newNode.nodeId,
          oldPath:   oldNode.path,
          newPath:   newNode.path,
        },
      };
    }
    return {
      type:    'renamed',
      details: {
        oldNodeId: oldNode.nodeId,
        newNodeId: newNode.nodeId,
        oldPath:   oldNode.path,
        newPath:   newNode.path,
      },
    };
  }

  if (matchStage === 'fingerprint') {
    if (sameNodeId) {
      return {
        type:    'modified',
        details: {
          oldContentHash: oldNode.sourceContentHash ?? undefined,
          newContentHash: newNode.contentHash ?? undefined,
          oldNodeId:      oldNode.nodeId,
          newNodeId:      newNode.nodeId,
          oldPath:        oldNode.path,
          newPath:        newNode.path,
        },
      };
    }
    if (isSignificantPathChange(oldNode.path, newNode.path)) {
      return {
        type:    'moved',
        details: {
          oldNodeId: oldNode.nodeId,
          newNodeId: newNode.nodeId,
          oldPath:   oldNode.path,
          newPath:   newNode.path,
        },
      };
    }
    return {
      type:    'renamed',
      details: {
        oldNodeId: oldNode.nodeId,
        newNodeId: newNode.nodeId,
        oldPath:   oldNode.path,
        newPath:   newNode.path,
      },
    };
  }

  // similarity stage
  if (sameNodeId) {
    return {
      type:    'modified',
      details: {
        oldContentHash:  oldNode.sourceContentHash ?? undefined,
        newContentHash:  newNode.contentHash ?? undefined,
        similarityScore: score,
        oldNodeId:       oldNode.nodeId,
        newNodeId:       newNode.nodeId,
        oldPath:         oldNode.path,
        newPath:         newNode.path,
      },
    };
  }

  if (isSignificantPathChange(oldNode.path, newNode.path)) {
    return {
      type:    'moved',
      details: {
        oldNodeId:       oldNode.nodeId,
        newNodeId:       newNode.nodeId,
        oldPath:         oldNode.path,
        newPath:         newNode.path,
        similarityScore: score,
      },
    };
  }

  if (getChapter(oldNode.nodeId) === getChapter(newNode.nodeId)) {
    return {
      type:    'renamed_modified',
      details: {
        oldContentHash:  oldNode.sourceContentHash ?? undefined,
        newContentHash:  newNode.contentHash ?? undefined,
        oldNodeId:       oldNode.nodeId,
        newNodeId:       newNode.nodeId,
        oldPath:         oldNode.path,
        newPath:         newNode.path,
        similarityScore: score,
      },
    };
  }

  return {
    type:    'moved',
    details: {
      oldNodeId:       oldNode.nodeId,
      newNodeId:       newNode.nodeId,
      oldPath:         oldNode.path,
      newPath:         newNode.path,
      similarityScore: score,
    },
  };
}

// --- Pre-compute Hashes ---

/** Compute exact and normalized content hashes. */
function prepareNewNodes(parsedNodes: ParsedDocumentNode[]): NewNode[] {
  return parsedNodes.map(node => ({
    id:              node.id,
    nodeId:          node.nodeId,
    nodeKind:        node.nodeKind,
    path:            node.path,
    level:           node.level,
    parentNodeId:    node.parentNodeId,
    content:         node.content,
    contentHash:     node.content ? generateHash(node.content) : null,
    fingerprintHash: node.content ? generateHash(normalizeFingerprint(node.content)) : null,
  }));
}

// --- Content and structural matching ---

const SIMILARITY_THRESHOLD = 0.55;
const DISTANT_SIMILARITY_THRESHOLD = 0.8;
const SPLIT_CANDIDATE_THRESHOLD = 0.55;
const SPLIT_COVERAGE_THRESHOLD = 0.8;
const MERGE_CANDIDATE_THRESHOLD = 0.55;
const MERGE_COVERAGE_THRESHOLD = 0.8;
const MAX_SPLIT_CANDIDATES = 4;

/** Match stable identities and preserve split and merge relations. */
export function matchEntities(
  oldNodes: OldNode[],
  parsedNodes: ParsedDocumentNode[],
  newVersionId: string,
): MatchResult {
  const newNodes = prepareNewNodes(parsedNodes);

  const matchedOldIds = new Set<string>();
  const matchedNewIds = new Set<string>();
  const entityAssignments = new Map<string, EntityAssignment>();
  const changes: ChangeRecord[] = [];

  // Build lookup indexes
  const newByNodeId = new Map(newNodes.map(n => [n.nodeId, n]));

  const oldByContentHash = new Map<string, OldNode[]>();
  for (const node of oldNodes) {
    if (!node.sourceContentHash) continue;
    const list = oldByContentHash.get(node.sourceContentHash) ?? [];
    list.push(node);
    oldByContentHash.set(node.sourceContentHash, list);
  }

  const newByContentHash = new Map<string, NewNode[]>();
  for (const node of newNodes) {
    if (!node.contentHash) continue;
    const list = newByContentHash.get(node.contentHash) ?? [];
    list.push(node);
    newByContentHash.set(node.contentHash, list);
  }

  const oldByFingerprintHash = new Map<string, OldNode[]>();
  for (const node of oldNodes) {
    if (!node.sourceFingerprintHash) continue;
    const list = oldByFingerprintHash.get(node.sourceFingerprintHash) ?? [];
    list.push(node);
    oldByFingerprintHash.set(node.sourceFingerprintHash, list);
  }

  const newByFingerprintHash = new Map<string, NewNode[]>();
  for (const node of newNodes) {
    if (!node.fingerprintHash) continue;
    const list = newByFingerprintHash.get(node.fingerprintHash) ?? [];
    list.push(node);
    newByFingerprintHash.set(node.fingerprintHash, list);
  }

  /** Assign a prior identity and record meaningful differences. */
  function recordMatch(
    oldNode: OldNode,
    newNode: NewNode,
    stage: 'nodeId' | 'content' | 'fingerprint' | 'similarity',
    score: number,
  ) {
    matchedOldIds.add(oldNode.nodeId);
    matchedNewIds.add(newNode.nodeId);
    entityAssignments.set(newNode.nodeId, {
      entityId: oldNode.entityId,
      isNew:    false,
    });

    // Check if content is identical (unchanged) — no change record needed
    if (oldNode.sourceContentHash && newNode.contentHash && oldNode.sourceContentHash === newNode.contentHash
      && oldNode.nodeId === newNode.nodeId && oldNode.path === newNode.path) {
      return;
    }

    const { type, details } = classifyChange(oldNode, newNode, stage, score);
    changes.push({
      entityId:        oldNode.entityId,
      fromNodeRefId:   oldNode.id,
      toNodeRefId:     newNode.id,
      type,
      confidenceScore: score,
      details,
    });
  }

  // --- Stage 1: Unchanged content at the same address ---
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;
    const newNode = newByNodeId.get(oldNode.nodeId);
    if (!newNode || matchedNewIds.has(newNode.nodeId)) continue;

    // An occupied number may now describe a newly inserted rule. Reserve only
    // unchanged pairs before searching for the old wording at another address.
    if (oldNode.content !== newNode.content) continue;
    recordMatch(oldNode, newNode, oldNode.path === newNode.path ? 'nodeId' : 'content', 1.0);
  }

  // --- Stage 2: Exact content hash match ---
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;
    if (!oldNode.sourceContentHash) continue;

    const candidates = newByContentHash.get(oldNode.sourceContentHash);
    if (!candidates) continue;

    // Identical wording is not evidence that a heading became a body paragraph.
    const available = candidates.find(n => !matchedNewIds.has(n.nodeId) && n.nodeKind === oldNode.nodeKind && n.level === oldNode.level);
    if (!available) continue;

    recordMatch(oldNode, available, 'content', 1.0);
  }

  // --- Stage 3: Fingerprint hash match ---
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;
    if (!oldNode.sourceFingerprintHash) continue;

    const candidates = newByFingerprintHash.get(oldNode.sourceFingerprintHash);
    if (!candidates) continue;

    // Fingerprint matches must preserve node kind and structural depth.
    const available = candidates
      .filter(n => !matchedNewIds.has(n.nodeId))
      .find(n => n.nodeKind === oldNode.nodeKind && n.level === oldNode.level);

    if (!available) continue;

    recordMatch(oldNode, available, 'fingerprint', 1.0);
  }

  // --- Stage 4: Strongest remaining content candidates ---
  const proposals: { oldNode: OldNode; newNode: NewNode; score: number }[] = [];
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId) || !oldNode.content) continue;
    for (const newNode of newNodes) {
      if (matchedNewIds.has(newNode.nodeId) || !newNode.content) continue;
      if (newNode.level !== oldNode.level || newNode.nodeKind !== oldNode.nodeKind) continue;
      const nearby = getChapter(newNode.nodeId) === getChapter(oldNode.nodeId) || isNearbyPath(oldNode.path, newNode.path);
      const score = nearby
        ? scoreCandidate(oldNode.content, newNode.content, structureBonus(oldNode, newNode))
        : scoreCandidate(oldNode.content, newNode.content, 0) / 0.85;
      // Normalize distant text evidence without awarding a structural bonus.
      // A distant match needs substantially stronger text evidence than a local edit.
      if (score >= (nearby ? SIMILARITY_THRESHOLD : DISTANT_SIMILARITY_THRESHOLD)) proposals.push({ oldNode, newNode, score });
    }
  }
  // Source iteration order must not let a weak same-number match consume a much
  // stronger moved-and-edited candidate needed by another rule.
  proposals.sort((left, right) => right.score - left.score
    || Number(right.oldNode.nodeId === right.newNode.nodeId) - Number(left.oldNode.nodeId === left.newNode.nodeId));
  for (const { oldNode, newNode, score } of proposals) {
    if (matchedOldIds.has(oldNode.nodeId) || matchedNewIds.has(newNode.nodeId)) continue;
    recordMatch(oldNode, newNode, 'similarity', score);
  }

  // Retain ordinary rewrites at an unchanged address when no content-based
  // correspondence claimed either side; these can legitimately share few words.
  for (const oldNode of oldNodes) {
    const newNode = newByNodeId.get(oldNode.nodeId);
    if (matchedOldIds.has(oldNode.nodeId) || newNode == null || matchedNewIds.has(newNode.nodeId)) continue;
    recordMatch(oldNode, newNode, 'nodeId', 1.0);
  }

  // --- Split Detection ---
  // One old node split into multiple new nodes
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;
    if (!oldNode.content) continue;

    const candidates = newNodes
      .filter(n => !matchedNewIds.has(n.nodeId))
      .filter(n => n.content != null)
      .filter(n => n.nodeKind === oldNode.nodeKind)
      .map(n => ({
        node:  n,
        score: scoreCandidate(oldNode.content!, n.content!, structureBonus(oldNode, n)),
      }))
      .filter(c => c.score >= SPLIT_CANDIDATE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (candidates.length < 2) continue;

    const topCandidates = candidates.slice(0, MAX_SPLIT_CANDIDATES);
    const combinedContent = topCandidates.map(c => c.node.content!).join(' ');
    const coverageScore = scoreCandidate(oldNode.content, combinedContent, 1.0);

    if (coverageScore < SPLIT_COVERAGE_THRESHOLD) continue;

    // Confirm split
    matchedOldIds.add(oldNode.nodeId);

    const relations: ChangeRelation[] = [];

    // From side: the old node
    relations.push({
      side:      'from',
      entityId:  oldNode.entityId,
      nodeRefId: oldNode.id,
      nodeId:    oldNode.nodeId,
      weight:    1.0,
      sortOrder: 0,
    });

    // To side: each new candidate
    for (let i = 0; i < topCandidates.length; i++) {
      const candidate = topCandidates[i]!;
      matchedNewIds.add(candidate.node.nodeId);

      const newEntityId = randomUUID();
      entityAssignments.set(candidate.node.nodeId, {
        entityId:        newEntityId,
        isNew:           true,
        originVersionId: newVersionId,
        originNodeId:    candidate.node.nodeId,
      });

      relations.push({
        side:      'to',
        entityId:  newEntityId,
        nodeRefId: candidate.node.id,
        nodeId:    candidate.node.nodeId,
        weight:    candidate.score,
        sortOrder: i + 1,
      });
    }

    changes.push({
      entityId:         oldNode.entityId,
      fromNodeRefId:    oldNode.id,
      toNodeRefId:      null,
      type:             'split',
      confidenceScore:  coverageScore,
      reviewStateCache: 'pending',
      details:          {
        oldNodeId:       oldNode.nodeId,
        oldPath:         oldNode.path,
        similarityScore: coverageScore,
      },
      relations,
    });
  }

  // --- Merge Detection ---
  // Multiple old nodes merged into one new node
  for (const newNode of newNodes) {
    if (matchedNewIds.has(newNode.nodeId)) continue;
    if (!newNode.content) continue;

    const candidates = oldNodes
      .filter(n => !matchedOldIds.has(n.nodeId))
      .filter(n => n.content != null)
      .filter(n => n.nodeKind === newNode.nodeKind)
      .map(n => ({
        node:  n,
        score: scoreCandidate(n.content!, newNode.content!, structureBonus(n, newNode)),
      }))
      .filter(c => c.score >= MERGE_CANDIDATE_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (candidates.length < 2) continue;

    const combinedContent = candidates.map(c => c.node.content!).join(' ');
    const coverageScore = scoreCandidate(combinedContent, newNode.content, 1.0);

    if (coverageScore < MERGE_COVERAGE_THRESHOLD) continue;

    // Confirm merge
    matchedNewIds.add(newNode.nodeId);

    const newEntityId = randomUUID();
    entityAssignments.set(newNode.nodeId, {
      entityId:        newEntityId,
      isNew:           true,
      originVersionId: newVersionId,
      originNodeId:    newNode.nodeId,
    });

    const relations: ChangeRelation[] = [];

    // From side: each old candidate
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      matchedOldIds.add(candidate.node.nodeId);

      relations.push({
        side:      'from',
        entityId:  candidate.node.entityId,
        nodeRefId: candidate.node.id,
        nodeId:    candidate.node.nodeId,
        weight:    candidate.score,
        sortOrder: i,
      });
    }

    // To side: the new node
    relations.push({
      side:      'to',
      entityId:  newEntityId,
      nodeRefId: newNode.id,
      nodeId:    newNode.nodeId,
      weight:    1.0,
      sortOrder: candidates.length,
    });

    changes.push({
      entityId:         newEntityId,
      fromNodeRefId:    null,
      toNodeRefId:      newNode.id,
      type:             'merged',
      confidenceScore:  coverageScore,
      reviewStateCache: 'pending',
      details:          {
        newNodeId:       newNode.nodeId,
        newPath:         newNode.path,
        similarityScore: coverageScore,
      },
      relations,
    });
  }

  // --- Residual: unmatched old nodes -> removed ---
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;

    changes.push({
      entityId:        oldNode.entityId,
      fromNodeRefId:   oldNode.id,
      toNodeRefId:     null,
      type:            'removed',
      confidenceScore: 1.0,
      details:         {
        oldNodeId: oldNode.nodeId,
        oldPath:   oldNode.path,
      },
    });
  }

  // --- Residual: unmatched new nodes -> added ---
  for (const newNode of newNodes) {
    if (matchedNewIds.has(newNode.nodeId)) continue;

    const newEntityId = randomUUID();
    entityAssignments.set(newNode.nodeId, {
      entityId:        newEntityId,
      isNew:           true,
      originVersionId: newVersionId,
      originNodeId:    newNode.nodeId,
    });

    changes.push({
      entityId:        newEntityId,
      fromNodeRefId:   null,
      toNodeRefId:     newNode.id,
      type:            'added',
      confidenceScore: 1.0,
      details:         {
        newNodeId: newNode.nodeId,
        newPath:   newNode.path,
      },
    });
  }

  return { entityAssignments, changes: excludeInsertedNumbering(oldNodes, parsedNodes, entityAssignments, changes) };
}
