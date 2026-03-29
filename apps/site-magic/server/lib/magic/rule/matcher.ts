import type { ParsedRuleNode } from './parser';
import { generateFingerprint } from './parser';

export type ChangeType
  = | 'added' // New rule added
    | 'removed' // Rule removed
    | 'modified' // Content modified (same rule ID)
    | 'renamed' // Renamed (content mostly unchanged)
    | 'renamed_modified' // Renamed + content modified
    | 'moved' // Moved to different chapter
    | 'split' // Split into multiple rules
    | 'merged'; // Multiple rules merged into one

export interface MatchResult {
  type:       ChangeType | 'unchanged';
  oldNodeId:  string | null;
  newNodeId:  string | null;
  similarity: number;
  details?: {
    oldRuleId?:        string;
    newRuleId?:        string;
    oldContentHash?:   string;
    newContentHash?:   string;
    fingerprintMatch?: boolean;
  };
}

export interface SplitResult {
  type:            'split';
  fromRuleId:      string;
  intoRuleIds:     string[];
  similarities:    number[];
  totalSimilarity: number;
}

export interface MergeResult {
  type:            'merged';
  fromRuleIds:     string[];
  intoRuleId:      string;
  similarities:    number[];
  totalSimilarity: number;
}

/**
 * Tokenize text into words for Jaccard similarity
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/**
 * Calculate Jaccard similarity between two texts
 * Returns a value between 0 and 1
 */
export function jaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(tokenize(text1));
  const words2 = new Set(tokenize(text2));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Calculate fingerprint similarity (exact match after normalization)
 */
export function fingerprintSimilarity(text1: string, text2: string): boolean {
  return generateFingerprint(text1) === generateFingerprint(text2);
}

/**
 * Get chapter number from rule ID
 */
function getChapter(ruleId: string): string {
  return ruleId.split('.')[0] ?? '';
}

/**
 * Check if two rules are in the same chapter
 */
function sameChapter(ruleId1: string, ruleId2: string): boolean {
  return getChapter(ruleId1) === getChapter(ruleId2);
}

/**
 * Exact match: content hash is identical
 */
export function exactMatch(
  oldNode: ParsedRuleNode,
  newNodes: Map<string, ParsedRuleNode>,
): string | null {
  for (const [id, node] of newNodes) {
    if (node.contentHash === oldNode.contentHash) {
      return id;
    }
  }
  return null;
}

/**
 * Fingerprint match: normalized content is identical
 */
export function fingerprintMatch(
  oldNode: ParsedRuleNode,
  newNodes: Map<string, ParsedRuleNode>,
): string | null {
  const oldFingerprint = generateFingerprint(oldNode.content);

  for (const [id, node] of newNodes) {
    if (generateFingerprint(node.content) === oldFingerprint) {
      return id;
    }
  }
  return null;
}

/**
 * Similarity match: Jaccard similarity above threshold
 * Restricted to same chapter to avoid false matches
 */
export function similarityMatch(
  oldNode: ParsedRuleNode,
  newNodes: Map<string, ParsedRuleNode>,
  threshold = 0.85,
): { id: string, similarity: number } | null {
  let bestMatch: { id: string, similarity: number } | null = null;

  for (const [id, node] of newNodes) {
    // Restrict to same chapter to avoid false matches
    if (!sameChapter(oldNode.ruleId, node.ruleId)) continue;

    const similarity = jaccardSimilarity(oldNode.content, node.content);

    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { id, similarity };
    }
  }

  return bestMatch;
}

/**
 * Detect if a rule has been split into multiple rules
 * A rule is split if multiple new rules have high similarity with the old rule
 */
export function detectSplit(
  oldNode: ParsedRuleNode,
  newNodes: Map<string, ParsedRuleNode>,
  threshold = 0.6,
  minMatches = 2,
): SplitResult | null {
  const candidates: { id: string, similarity: number, node: ParsedRuleNode }[] = [];

  // Find all new rules with similarity above threshold
  for (const [id, node] of newNodes) {
    const similarity = jaccardSimilarity(oldNode.content, node.content);
    if (similarity >= threshold) {
      candidates.push({ id, similarity, node });
    }
  }

  // Need at least minMatches candidates for a split
  if (candidates.length < minMatches) return null;

  // Sort by similarity descending
  candidates.sort((a, b) => b.similarity - a.similarity);

  // Calculate combined similarity with top candidates
  const combinedContent = candidates.map(c => c.node.content).join(' ');
  const totalSimilarity = jaccardSimilarity(oldNode.content, combinedContent);

  // Split is confirmed if combined content is very similar to original
  if (totalSimilarity > 0.8) {
    return {
      type:         'split',
      fromRuleId:   oldNode.ruleId,
      intoRuleIds:  candidates.map(c => c.id),
      similarities: candidates.map(c => c.similarity),
      totalSimilarity,
    };
  }

  return null;
}

/**
 * Detect if multiple rules have been merged into one
 * Multiple old rules combine to form one new rule
 */
export function detectMerge(
  oldNodes: Map<string, ParsedRuleNode>,
  newNode: ParsedRuleNode,
  threshold = 0.6,
): MergeResult | null {
  const candidates: { id: string, similarity: number, node: ParsedRuleNode }[] = [];

  // Find all old rules with similarity to the new rule
  for (const [id, node] of oldNodes) {
    const similarity = jaccardSimilarity(node.content, newNode.content);
    if (similarity >= threshold) {
      candidates.push({ id, similarity, node });
    }
  }

  // Need at least 2 candidates for a merge
  if (candidates.length < 2) return null;

  // Calculate combined similarity
  const combinedContent = candidates.map(c => c.node.content).join(' ');
  const totalSimilarity = jaccardSimilarity(combinedContent, newNode.content);

  // Merge is confirmed if combined old content matches new content
  if (totalSimilarity > 0.8) {
    return {
      type:         'merged',
      fromRuleIds:  candidates.map(c => c.id),
      intoRuleId:   newNode.ruleId,
      similarities: candidates.map(c => c.similarity),
      totalSimilarity,
    };
  }

  return null;
}

/**
 * Multi-level matching strategy
 * 1. Exact match (content hash)
 * 2. Fingerprint match (normalized content)
 * 3. Similarity match (Jaccard similarity)
 */
export function matchRule(
  oldNode: ParsedRuleNode,
  newNodes: Map<string, ParsedRuleNode>,
  similarityThreshold = 0.85,
): MatchResult {
  const oldNodeId = oldNode.id;

  // Level 1: Exact match
  const exactId = exactMatch(oldNode, newNodes);
  if (exactId) {
    const newNode = newNodes.get(exactId)!;
    return {
      type:       oldNode.ruleId === newNode.ruleId ? 'unchanged' : 'moved',
      oldNodeId,
      newNodeId:  exactId,
      similarity: 1,
      details:    {
        oldRuleId:      oldNode.ruleId,
        newRuleId:      newNode.ruleId,
        oldContentHash: oldNode.contentHash,
        newContentHash: newNode.contentHash,
      },
    };
  }

  // Level 2: Fingerprint match (content is essentially the same but may differ in whitespace/punctuation)
  const fingerprintId = fingerprintMatch(oldNode, newNodes);
  if (fingerprintId) {
    const newNode = newNodes.get(fingerprintId)!;
    const sameId = oldNode.ruleId === newNode.ruleId;
    const sameChapter = getChapter(oldNode.ruleId) === getChapter(newNode.ruleId);

    let type: ChangeType;
    if (sameId) {
      type = 'modified';
    } else if (sameChapter) {
      type = 'renamed';
    } else {
      type = 'moved';
    }

    return {
      type,
      oldNodeId,
      newNodeId:  fingerprintId,
      similarity: 1,
      details:    {
        oldRuleId:        oldNode.ruleId,
        newRuleId:        newNode.ruleId,
        oldContentHash:   oldNode.contentHash,
        newContentHash:   newNode.contentHash,
        fingerprintMatch: true,
      },
    };
  }

  // Level 3: Similarity match
  const similar = similarityMatch(oldNode, newNodes, similarityThreshold);
  if (similar) {
    const newNode = newNodes.get(similar.id)!;
    const sameId = oldNode.ruleId === newNode.ruleId;
    const sameChapter = getChapter(oldNode.ruleId) === getChapter(newNode.ruleId);

    let type: ChangeType;
    if (sameId) {
      type = 'modified';
    } else if (sameChapter) {
      type = 'renamed_modified';
    } else {
      type = 'moved';
    }

    return {
      type,
      oldNodeId,
      newNodeId:  similar.id,
      similarity: similar.similarity,
      details:    {
        oldRuleId:      oldNode.ruleId,
        newRuleId:      newNode.ruleId,
        oldContentHash: oldNode.contentHash,
        newContentHash: newNode.contentHash,
      },
    };
  }

  // No match found - rule was removed
  return {
    type:       'removed',
    oldNodeId,
    newNodeId:  null,
    similarity: 0,
    details:    {
      oldRuleId:      oldNode.ruleId,
      oldContentHash: oldNode.contentHash,
    },
  };
}

/**
 * Detect all changes between two versions
 */
export function detectChanges(
  oldNodes: ParsedRuleNode[],
  newNodes: ParsedRuleNode[],
): {
  matches: MatchResult[];
  splits:  SplitResult[];
  merges:  MergeResult[];
} {
  const oldNodeMap = new Map(oldNodes.map(n => [n.id, n]));
  const newNodeMap = new Map(newNodes.map(n => [n.id, n]));

  const matches: MatchResult[] = [];
  const splits: SplitResult[] = [];
  const merges: MergeResult[] = [];

  const matchedOldNodes = new Set<string>();
  const matchedNewNodes = new Set<string>();

  // First pass: detect splits
  for (const oldNode of oldNodes) {
    const splitResult = detectSplit(oldNode, newNodeMap);
    if (splitResult) {
      splits.push(splitResult);
      matchedOldNodes.add(oldNode.id);
      for (const id of splitResult.intoRuleIds) {
        matchedNewNodes.add(id);
      }
    }
  }

  // Second pass: detect merges
  const unmatchedOldNodes = new Map(
    oldNodes.filter(n => !matchedOldNodes.has(n.id)).map(n => [n.id, n]),
  );

  for (const newNode of newNodes) {
    if (matchedNewNodes.has(newNode.id)) continue;

    const mergeResult = detectMerge(unmatchedOldNodes, newNode);
    if (mergeResult) {
      merges.push(mergeResult);
      matchedNewNodes.add(newNode.id);
      for (const id of mergeResult.fromRuleIds) {
        matchedOldNodes.add(id);
      }
    }
  }

  // Third pass: regular matching for remaining nodes
  const remainingOldNodes = oldNodes.filter(n => !matchedOldNodes.has(n.id));
  const remainingNewNodes = new Map(
    newNodes.filter(n => !matchedNewNodes.has(n.id)).map(n => [n.id, n]),
  );

  for (const oldNode of remainingOldNodes) {
    const match = matchRule(oldNode, remainingNewNodes);
    matches.push(match);

    if (match.newNodeId) {
      matchedNewNodes.add(match.newNodeId);
      remainingNewNodes.delete(match.newNodeId);
    }
  }

  // Any remaining new nodes are additions
  for (const [id, node] of remainingNewNodes) {
    matches.push({
      type:       'added',
      oldNodeId:  null,
      newNodeId:  id,
      similarity: 0,
      details:    {
        newRuleId:      node.ruleId,
        newContentHash: node.contentHash,
      },
    });
  }

  return { matches, splits, merges };
}
