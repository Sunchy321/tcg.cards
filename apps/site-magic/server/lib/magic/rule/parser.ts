import { createHash } from 'crypto';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

// Hierarchy patterns: ordered by specificity (most specific first)
const HIERARCHY_PATTERNS = [
  { level: 3, regex: /^glossary-(.+)$/ }, // glossary entries (internal ID format)
  { level: 2, regex: /^(\d+\.\d+[a-z])\.\s+(.+)$/ }, // 100.1a. Content
  { level: 1, regex: /^(\d+\.\d+)\.\s+(.+)$/ }, // 100.1. Content
  { level: 0, regex: /^(\d{3})\.\s+(.+)$/ }, // 100. General
  { level: -1, regex: /^([1-9])\.\s+(.+)$/ }, // 1. Game Concepts (chapter)
];

// Glossary entry regex: matches "Abandon. Definition text"
const GLOSSARY_ENTRY_REGEX = /^([A-Z][a-zA-Z\s/]+)\.\s+(.+)$/;

export interface ParsedRuleNode {
  id:          string; // Composite ID: "{sourceId}/{nodeId}"
  sourceId:    string; // Version ID (e.g., "20240328")
  nodeId:      string; // Node identifier (e.g., "100.1", "100.1a", "1", "glossary-term")
  path:        string; // Materialized path (e.g., "100/1", "100/1/a")
  level:       number; // -1=chapter, 0=section, 1=rule, 2=subrule, 3=glossary
  parentId:    string | null; // Parent node ID
  title:       string | null; // For chapters/sections
  content:     string; // Full text content
  contentHash: string; // SHA256 hash of content
}

export interface ParsedRuleSource {
  id:            string; // Version ID (e.g., "20240328")
  effectiveDate: string; // Effective date
  publishedAt:   string; // Published date
  totalRules:    number; // Total number of nodes
  nodes:         ParsedRuleNode[]; // All parsed nodes
}

export interface CompressedContent {
  hash:    string; // SHA256 hash
  content: Buffer; // Gzip compressed content
  size:    number; // Original size in bytes
}

/**
 * Generate SHA256 hash of content
 */
export function generateContentHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Compress content using gzip
 */
export async function compressContent(content: string): Promise<CompressedContent> {
  const buffer = Buffer.from(content, 'utf-8');
  const compressed = await gzipAsync(buffer);
  const hash = generateContentHash(content);

  return {
    hash,
    content: compressed,
    size:    buffer.length,
  };
}

/**
 * Build materialized path from node ID
 * "702.1a" -> "702/1/a"
 * "1" -> "1"
 */
function buildPath(nodeId: string): string {
  // Handle glossary IDs
  if (nodeId.startsWith('glossary-')) {
    return nodeId;
  }

  // Handle numeric IDs like "100.1a" -> "100/1/a"
  const parts = nodeId.split('.');
  return parts.join('/');
}

/**
 * Get parent node ID from a node ID
 * "100.1a" -> "100.1"
 * "100.1" -> "100"
 * "100" -> "1" (chapter)
 * "1" -> null
 */
function getParentId(nodeId: string, level: number): string | null {
  // Glossary entries have no parent
  if (nodeId.startsWith('glossary-')) {
    return null;
  }

  const parts = nodeId.split('.');

  if (parts.length > 2) {
    // 100.1a -> 100.1
    return `${parts[0]}.${parts[1]}`;
  } else if (parts.length === 2) {
    // 100.1 -> 100
    return parts[0]!;
  } else if (parts.length === 1 && level === 0) {
    // 100 -> 1 (chapter), only if it's a 3-digit section
    const num = parseInt(parts[0]!, 10);
    if (num >= 100) {
      return String(Math.floor(num / 100));
    }
  }

  return null;
}

/**
 * Parse comprehensive rules text file
 */
export async function parseRuleFile(
  sourceId: string,
  content: string,
): Promise<ParsedRuleSource> {
  // Remove UTF-8 BOM if present and normalize line endings
  const cleanContent = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const lines = cleanContent.split('\n');
  const nodes: ParsedRuleNode[] = [];

  let effectiveDate = '';
  let inGlossary = false;
  let inContentSection = false;

  // Current node being built
  let currentNode: { id: string, level: number, lines: string[] } | null = null;

  function flushCurrentNode(): void {
    if (!currentNode || currentNode.lines.length === 0) return;

    const fullText = currentNode.lines.join(' ').trim();
    const contentHash = generateContentHash(fullText);
    const parentId = getParentId(currentNode.id, currentNode.level);

    const node: ParsedRuleNode = {
      id:       `${sourceId}/${currentNode.id}`,
      sourceId,
      nodeId:   currentNode.id,
      path:     buildPath(currentNode.id),
      level:    currentNode.level,
      parentId: parentId ? `${sourceId}/${parentId}` : null,
      title:    currentNode.level <= 0 ? fullText : null,
      content:  fullText,
      contentHash,
    };

    nodes.push(node);
    currentNode = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Parse effective date from header
    if (line.includes('Effective')) {
      const dateMatch = line.match(/Effective\s+(.+)/i);
      if (dateMatch) {
        effectiveDate = dateMatch[1]!.trim();
      }
      continue;
    }

    // Detect glossary section (only after content section)
    if (inContentSection && (line === 'Glossary' || line === 'GLOSSARY')) {
      flushCurrentNode();
      inGlossary = true;
      continue;
    }

    // Detect credits section (end of rules)
    if (inContentSection && (line === 'Credits' || line === 'CREDITS')) {
      flushCurrentNode();
      break;
    }

    // Try to match as a hierarchy node (chapter/section/rule/subrule)
    let matched = false;

    for (const pattern of HIERARCHY_PATTERNS) {
      const match = line.match(pattern.regex);
      if (match) {
        // Flush previous node
        flushCurrentNode();

        const nodeId = match[1]!;
        const content = match[2]!;

        currentNode = {
          id:    nodeId,
          level: pattern.level,
          lines: [content],
        };

        // First chapter marks entry into content section
        if (pattern.level === -1) {
          inContentSection = true;
        }

        matched = true;
        break;
      }
    }

    if (matched) continue;

    // Try to match as glossary entry (only in glossary section)
    if (inGlossary) {
      const glossaryMatch = line.match(GLOSSARY_ENTRY_REGEX);
      if (glossaryMatch) {
        flushCurrentNode();

        const term = glossaryMatch[1]!;
        const definition = glossaryMatch[2]!;
        const glossaryId = `glossary-${term.toLowerCase().replace(/\s+/g, '-')}`;

        currentNode = {
          id:    glossaryId,
          level: 3,
          lines: [`${term}. ${definition}`],
        };
        continue;
      }
    }

    // Continuation of current node
    if (currentNode && !line.startsWith('//')) {
      currentNode.lines.push(line);
    }
  }

  // Flush final node
  flushCurrentNode();

  return {
    id:          sourceId,
    effectiveDate,
    publishedAt: '',
    totalRules:  nodes.length,
    nodes,
  };
}

/**
 * Parse rule file and generate compressed content entries
 */
export async function parseAndCompressRuleFile(
  sourceId: string,
  content: string,
): Promise<{
  source:   ParsedRuleSource;
  contents: CompressedContent[];
}> {
  const source = await parseRuleFile(sourceId, content);
  const contentMap = new Map<string, string>();

  // Collect unique contents
  for (const node of source.nodes) {
    if (!contentMap.has(node.contentHash)) {
      contentMap.set(node.contentHash, node.content);
    }
  }

  // Compress all unique contents
  const contents: CompressedContent[] = [];
  for (const [hash, text] of contentMap) {
    const compressed = await compressContent(text);
    contents.push(compressed);
  }

  return { source, contents };
}

/**
 * Generate a fingerprint for fuzzy matching
 * Normalizes content for comparison (lowercase, remove punctuation, normalize whitespace)
 */
export function generateFingerprint(content: string): string {
  return content
    .toLowerCase()
    .replace(/[.,;:!?()[\]{}'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
