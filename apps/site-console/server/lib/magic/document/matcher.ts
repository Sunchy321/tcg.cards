import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { and, desc, eq, lt } from 'drizzle-orm';

import { db } from '#db/db';
import {
  DocumentNode,
  DocumentNodeContent,
  DocumentVersion,
  DocumentVersionImport,
} from '#schema/magic/document';

import type { NodeChangeDetails, NodeChangeType } from '#model/magic/schema/document';

import type { ParsedDocumentNode } from './parser';
import { generateHash, normalizeFingerprint } from './importer';

// --- Types ---

interface OldNode {
  id:                    string;
  nodeId:                string;
  nodeKind:              string;
  path:                  string;
  level:                 number;
  parentNodeId:          string | null;
  sourceContentHash:     string | null;
  sourceFingerprintHash: string | null;
  entityId:              string;
  content:               string | null;
}

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

export interface EntityAssignment {
  entityId:         string;
  isNew:            boolean;
  originVersionId?: string;
  originNodeId?:    string;
}

export interface ChangeRecord {
  entityId:        string | null;
  fromNodeRefId:   string | null;
  toNodeRefId:     string | null;
  type:            NodeChangeType;
  confidenceScore: number;
  details:         NodeChangeDetails;
}

export interface MatchResult {
  entityAssignments: Map<string, EntityAssignment>;
  changes:           ChangeRecord[];
}

// --- Similarity Functions ---

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

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

function generateTrigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const trigrams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.slice(i, i + 3));
  }
  return trigrams;
}

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

function getPathPrefix(path: string, depth: number): string {
  return path.split('/').slice(0, depth).join('/');
}

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

function isSignificantPathChange(path1: string, path2: string): boolean {
  // Different top-level chapter
  return getPathPrefix(path1, 1) !== getPathPrefix(path2, 1);
}

function structureBonus(oldNode: OldNode, newNode: { nodeKind: string, path: string, level: number, parentNodeId: string | null }): number {
  // Same parent node gives highest bonus
  if (oldNode.parentNodeId && oldNode.parentNodeId === newNode.parentNodeId) return 1.0;
  // Same chapter
  if (getPathPrefix(oldNode.path, 1) === getPathPrefix(newNode.path, 1)) return 0.7;
  // Nearby path
  if (isNearbyPath(oldNode.path, newNode.path)) return 0.5;
  return 0.0;
}

function scoreCandidate(oldText: string, newText: string, bonus: number): number {
  const dice = diceSimilarity(oldText, newText);
  const trigram = trigramSimilarity(oldText, newText);
  return dice * 0.45 + trigram * 0.40 + bonus * 0.15;
}

// --- Change Classification ---

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

// --- Database Queries ---

export async function findPreviousVersion(documentId: string, currentVersionTag: string): Promise<string | null> {
  const result = await db
    .select({ id: DocumentVersion.id })
    .from(DocumentVersion)
    .innerJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
    .where(and(
      eq(DocumentVersion.documentId, documentId),
      eq(DocumentVersionImport.importStatus, 'completed'),
      lt(DocumentVersion.versionTag, currentVersionTag),
    ))
    .orderBy(desc(DocumentVersion.versionTag))
    .limit(1)
    .then(rows => rows[0] ?? null);

  return result?.id ?? null;
}

export async function loadPreviousVersionNodes(versionId: string): Promise<OldNode[]> {
  const rows = await db
    .select({
      id:                    DocumentNode.id,
      nodeId:                DocumentNode.nodeId,
      nodeKind:              DocumentNode.nodeKind,
      path:                  DocumentNode.path,
      level:                 DocumentNode.level,
      parentNodeId:          DocumentNode.parentNodeId,
      sourceContentHash:     DocumentNode.sourceContentHash,
      sourceFingerprintHash: DocumentNode.sourceFingerprintHash,
      entityId:              DocumentNode.entityId,
      contentBytes:          DocumentNodeContent.content,
    })
    .from(DocumentNode)
    .leftJoin(DocumentNodeContent, and(
      eq(DocumentNodeContent.documentNodeId, DocumentNode.id),
      eq(DocumentNodeContent.status, 'source'),
    ))
    .where(eq(DocumentNode.versionId, versionId));

  return rows.map(row => ({
    id:                    row.id,
    nodeId:                row.nodeId,
    nodeKind:              row.nodeKind,
    path:                  row.path,
    level:                 row.level,
    parentNodeId:          row.parentNodeId,
    sourceContentHash:     row.sourceContentHash,
    sourceFingerprintHash: row.sourceFingerprintHash,
    entityId:              row.entityId,
    content:               row.contentBytes ? gunzipSync(Buffer.from(row.contentBytes)).toString('utf8') : null,
  }));
}

// --- Pre-compute Hashes ---

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

// --- Four-Stage Matching ---

const SIMILARITY_THRESHOLD = 0.55;

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
  const oldByNodeId = new Map(oldNodes.map(n => [n.nodeId, n]));
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

  // --- Stage 1: Same nodeId ---
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;
    const newNode = newByNodeId.get(oldNode.nodeId);
    if (!newNode || matchedNewIds.has(newNode.nodeId)) continue;

    recordMatch(oldNode, newNode, 'nodeId', 1.0);
  }

  // --- Stage 2: Exact content hash match ---
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;
    if (!oldNode.sourceContentHash) continue;

    const candidates = newByContentHash.get(oldNode.sourceContentHash);
    if (!candidates) continue;

    const available = candidates.find(n => !matchedNewIds.has(n.nodeId));
    if (!available) continue;

    recordMatch(oldNode, available, 'content', 1.0);
  }

  // --- Stage 3: Fingerprint hash match ---
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;
    if (!oldNode.sourceFingerprintHash) continue;

    const candidates = newByFingerprintHash.get(oldNode.sourceFingerprintHash);
    if (!candidates) continue;

    // Prefer same nodeKind and level
    const available = candidates
      .filter(n => !matchedNewIds.has(n.nodeId))
      .find(n => n.nodeKind === oldNode.nodeKind && n.level === oldNode.level)
      ?? candidates.find(n => !matchedNewIds.has(n.nodeId));

    if (!available) continue;

    recordMatch(oldNode, available, 'fingerprint', 1.0);
  }

  // --- Stage 4: Candidate set similarity ---
  for (const oldNode of oldNodes) {
    if (matchedOldIds.has(oldNode.nodeId)) continue;
    if (!oldNode.content) continue;

    const candidates = newNodes
      .filter(n => !matchedNewIds.has(n.nodeId))
      .filter(n => n.content != null)
      .filter(n => {
        if (n.level !== oldNode.level) return false;
        if (n.nodeKind !== oldNode.nodeKind) return false;
        const sameChapter = getChapter(n.nodeId) === getChapter(oldNode.nodeId);
        const closePath = isNearbyPath(oldNode.path, n.path);
        return sameChapter || closePath;
      });

    if (candidates.length === 0) continue;

    let bestCandidate: NewNode | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const bonus = structureBonus(oldNode, candidate);
      const score = scoreCandidate(oldNode.content, candidate.content!, bonus);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate && bestScore >= SIMILARITY_THRESHOLD) {
      recordMatch(oldNode, bestCandidate, 'similarity', bestScore);
    }
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

  return { entityAssignments, changes };
}
