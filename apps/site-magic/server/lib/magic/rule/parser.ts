import { createHash } from 'crypto';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

// Rule ID regex: matches "100.1", "100.1a", "702.1", etc.
const RULE_ID_REGEX = /^(\d+)\.(\d+)([a-z]?)$/;

// Line regex: matches "100.1. Content text" or "100.1a. Content text"
const RULE_LINE_REGEX = /^(\d+\.\d+[a-z]?)\.\s+(.+)$/;

// Chapter regex: matches "1. Game Concepts" (chapter number + title)
const CHAPTER_LINE_REGEX = /^(\d+)\.\s+(.+)$/;

// Glossary entry regex: matches "Abandon. Definition text"
const GLOSSARY_ENTRY_REGEX = /^([A-Z][a-zA-Z\s/]+)\.\s+(.+)$/;

export interface ParsedRuleNode {
  id:          string; // Composite ID: "{sourceId}/{ruleId}"
  sourceId:    string; // Version ID (e.g., "20240328")
  ruleId:      string; // Official rule ID (e.g., "100.1", "100.1a")
  path:        string; // Materialized path (e.g., "100/1", "100/1/a")
  level:       number; // 0=chapter, 1=rule, 2=subrule, 3=glossary
  parentId:    string | null; // Parent node ID
  title:       string | null; // Chapter/section title
  content:     string; // Full text content
  contentHash: string; // SHA256 hash of content
}

export interface ParsedRuleSource {
  id:            string; // Version ID (e.g., "20240328")
  effectiveDate: string; // Effective date
  publishedAt:   string; // Published date
  totalRules:    number; // Total number of rules
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
 * Get chapter number from rule ID
 */
function getChapter(ruleId: string): string {
  const match = ruleId.match(/^(\d+)/);
  return match?.[1] ?? '';
}

/**
 * Build materialized path from rule ID
 * "702.1a" -> "702/1/a"
 */
function buildPath(ruleId: string): string {
  const match = ruleId.match(RULE_ID_REGEX);
  if (!match) return ruleId;

  const [, chapter, number, letter] = match;
  if (letter) {
    return `${chapter}/${number}/${letter}`;
  }
  return `${chapter}/${number}`;
}

/**
 * Get parent rule ID from a rule ID
 * "100.1a" -> "100.1"
 * "100.1" -> "100"
 */
function getParentRuleId(ruleId: string): string | null {
  const match = ruleId.match(RULE_ID_REGEX);
  if (!match) return null;

  const [, chapter, number, letter] = match;

  if (letter) {
    // 100.1a -> 100.1
    return `${chapter}.${number}`;
  } else if (number !== '0') {
    // 100.1 -> 100 (chapter)
    return chapter ?? null;
  }

  return null;
}

/**
 * Get level from rule ID
 * "100" -> 0 (chapter)
 * "100.1" -> 1 (rule)
 * "100.1a" -> 2 (subrule)
 */
function getLevel(ruleId: string): number {
  if (/^\d+$/.test(ruleId)) return 0; // Chapter only
  if (/^\d+\.\d+$/.test(ruleId)) return 1; // Rule
  if (/^\d+\.\d+[a-z]$/.test(ruleId)) return 2; // Subrule
  return 3; // Glossary or other
}

/**
 * Check if a line is a rule definition line
 */
function isRuleLine(line: string): boolean {
  return RULE_LINE_REGEX.test(line);
}

/**
 * Check if a line is a chapter heading
 */
function isChapterLine(line: string): boolean {
  // Matches "1. Game Concepts" but not "100.1. Some rule"
  return CHAPTER_LINE_REGEX.test(line) && !RULE_LINE_REGEX.test(line);
}

/**
 * Check if a line is a glossary entry
 */
function isGlossaryLine(line: string): boolean {
  return GLOSSARY_ENTRY_REGEX.test(line);
}

/**
 * Parse a single rule line
 */
function parseRuleLine(line: string): { ruleId: string, content: string } | null {
  const match = line.match(RULE_LINE_REGEX);
  if (!match) return null;

  return {
    ruleId:  match[1]!,
    content: match[2]!,
  };
}

/**
 * Parse a chapter line
 */
function parseChapterLine(line: string): { chapterNum: string, title: string } | null {
  const match = line.match(CHAPTER_LINE_REGEX);
  if (!match) return null;

  return {
    chapterNum: match[1]!,
    title:      match[2]!,
  };
}

/**
 * Parse a glossary entry line
 */
function parseGlossaryLine(line: string): { term: string, definition: string } | null {
  const match = line.match(GLOSSARY_ENTRY_REGEX);
  if (!match) return null;

  return {
    term:       match[1]!,
    definition: match[2]!,
  };
}

/**
 * Parse comprehensive rules text file
 *
 * File format:
 * - Chapters: "1. Game Concepts"
 * - Rules: "100.1. Some rule text"
 * - Subrules: "100.1a. Some subrule text"
 * - Glossary entries: "Term. Definition text"
 */
export async function parseRuleFile(
  sourceId: string,
  content: string,
): Promise<ParsedRuleSource> {
  const lines = content.split('\n');
  const nodes: ParsedRuleNode[] = [];

  let currentChapter: { num: string, title: string } | null = null;
  let currentRule: { id: string, text: string } | null = null;
  let inGlossary = false;
  let effectiveDate = '';
  const publishedAt = '';

  // Buffer for multi-line rule content
  const ruleBuffer: Map<string, string[]> = new Map();

  function flushRuleBuffer(ruleId: string, sourceId: string): ParsedRuleNode | null {
    const lines = ruleBuffer.get(ruleId);
    if (!lines || lines.length === 0) return null;

    const fullText = lines.join(' ').trim();
    const contentHash = generateContentHash(fullText);
    const parentId = getParentRuleId(ruleId);

    const node: ParsedRuleNode = {
      id:       `${sourceId}/${ruleId}`,
      sourceId,
      ruleId,
      path:     buildPath(ruleId),
      level:    getLevel(ruleId),
      parentId: parentId ? `${sourceId}/${parentId}` : null,
      title:    getLevel(ruleId) === 0 ? fullText : null,
      content:  fullText,
      contentHash,
    };

    ruleBuffer.delete(ruleId);
    return node;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();

    // Skip empty lines
    if (!line) continue;

    // Parse effective date from header
    if (line.includes('Effective')) {
      const dateMatch = line.match(/Effective\s+(.+)/i);
      if (dateMatch) {
        effectiveDate = dateMatch[1]!.trim();
      }
      continue;
    }

    // Detect glossary section
    if (line === 'Glossary' || line === 'GLOSSARY') {
      // Flush any pending rule
      if (currentRule) {
        const node = flushRuleBuffer(currentRule.id, sourceId);
        if (node) nodes.push(node);
        currentRule = null;
      }
      inGlossary = true;
      continue;
    }

    // Detect credits section (end of rules)
    if (line === 'Credits' || line === 'CREDITS') {
      if (currentRule) {
        const node = flushRuleBuffer(currentRule.id, sourceId);
        if (node) nodes.push(node);
        currentRule = null;
      }
      break;
    }

    // Parse chapter heading
    if (isChapterLine(line) && !inGlossary) {
      const chapter = parseChapterLine(line);
      if (chapter) {
        // Flush previous chapter if exists
        if (currentRule) {
          const node = flushRuleBuffer(currentRule.id, sourceId);
          if (node) nodes.push(node);
        }

        currentChapter = { num: chapter.chapterNum, title: chapter.title };
        currentRule = { id: chapter.chapterNum, text: chapter.title };
        ruleBuffer.set(chapter.chapterNum, [chapter.title]);
      }
      continue;
    }

    // Parse rule line
    if (isRuleLine(line) && !inGlossary) {
      const rule = parseRuleLine(line);
      if (rule) {
        // Flush previous rule
        if (currentRule) {
          const node = flushRuleBuffer(currentRule.id, sourceId);
          if (node) nodes.push(node);
        }

        currentRule = { id: rule.ruleId, text: rule.content };
        ruleBuffer.set(rule.ruleId, [rule.content]);
      }
      continue;
    }

    // Parse glossary entry
    if (isGlossaryLine(line) && inGlossary) {
      const entry = parseGlossaryLine(line);
      if (entry) {
        // Flush previous glossary entry
        if (currentRule) {
          const node = flushRuleBuffer(currentRule.id, sourceId);
          if (node) nodes.push(node);
        }

        const glossaryId = `glossary-${entry.term.toLowerCase().replace(/\s+/g, '-')}`;
        currentRule = { id: glossaryId, text: entry.definition };
        ruleBuffer.set(glossaryId, [`${entry.term}. ${entry.definition}`]);
      }
      continue;
    }

    // Continuation of current rule/glossary entry
    if (currentRule && line && !line.startsWith('//')) {
      const buffer = ruleBuffer.get(currentRule.id);
      if (buffer) {
        buffer.push(line);
      }
    }
  }

  // Flush final rule
  if (currentRule) {
    const node = flushRuleBuffer(currentRule.id, sourceId);
    if (node) nodes.push(node);
  }

  return {
    id:         sourceId,
    effectiveDate,
    publishedAt,
    totalRules: nodes.length,
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
