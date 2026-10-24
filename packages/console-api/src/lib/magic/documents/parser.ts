import { patchCrSource } from './source-patches';

/** Distinguishes source headings, rule text, and examples. */
export type DocumentNodeKind = 'heading' | 'implicit_heading' | 'content' | 'example';

/** Describes a source node before assigning its saved revision identity. */
export interface ParsedDocumentNode {
  id:           string;
  documentId:   string;
  versionId:    string;
  nodeId:       string;
  nodeKind:     DocumentNodeKind;
  path:         string;
  level:        number;
  parentNodeId: string | null;
  siblingOrder: number;
  content:      string | null;
}

/** Captures one parsed CR source and its document structure. */
export interface ParsedDocumentSource {
  documentId:     string;
  versionId:      string;
  versionTag:     string;
  effectiveDate:  string | null;
  publishedAt:    string | null;
  parserStrategy: string;
  nodes:          ParsedDocumentNode[];
}

/** Tracks source containers and sibling order during one parse. */
interface ParserContext {
  documentId:      string;
  versionId:       string;
  nodes:           ParsedDocumentNode[];
  nodeMap:         Map<string, ParsedDocumentNode>;
  siblingMap:      Map<string, number>;
  exampleCountMap: Map<string, number>;
}

const chapterPattern = /^([1-9]\d?)\.\s+(.+)$/;
const sectionPattern = /^(\d{3})\.\s+(.+)$/;
// Some official files omit the space after the terminal number punctuation (901.4.All).
// A bare number still needs whitespace so adjoining prose cannot supply a false boundary.
const rulePattern = /^(\d+\.\d+)(?:\.\s*|\s+)(\S.*)$/;
const subrulePattern = /^(\d+\.\d+[a-z]+)(?:\.\s*|\s+)(\S.*)$/;
const effectiveDatePattern = /^These rules are effective as of (.+)\.$/i;

/** Identifies the official TXT parsing rules used by import attempts. */
export const crParserVersion = 'magic-cr-txt-v6';

/** Normalizes source line endings without interpreting game symbols. */
function normalizeText(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Official TXT files also contain Unicode line breaks inside numbered rules.
    .replace(/[\u2028\u2029]/g, '\n');
}

/** Separates source paragraphs while preserving their internal lines. */
function splitParagraphs(input: string): string[] {
  return normalizeText(input)
    .split(/\n\s*\n+/)
    .map(part => part.trim())
    .filter(Boolean);
}

/** Joins wrapped source lines into one readable paragraph. */
function normalizeParagraph(input: string): string {
  return input
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/** Builds a stable anchor for a glossary term. */
export function toTermSlug(term: string): string {
  return term
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Scopes a parsed node to the source edition. */
function buildVersionNodeId(versionId: string, nodeId: string): string {
  return `${versionId}/${nodeId}`;
}

/** Derives the numeric chapter containing a rule section. */
function getChapterIdFromSectionId(sectionId: string): string {
  return String(Math.floor(Number(sectionId) / 100));
}

/** Constructs the chapter and section path for source navigation. */
function buildSectionPath(sectionId: string): string {
  return `${getChapterIdFromSectionId(sectionId)}/${sectionId}`;
}

/** Constructs hierarchical paths for rules and subrules. */
function buildRulePath(nodeId: string): string {
  const subruleMatch = nodeId.match(/^(\d+)\.(\d+)([a-z]+)$/);
  if (subruleMatch) {
    const [, sectionId, rule, subrule] = subruleMatch;
    return `${buildSectionPath(sectionId!)}/${rule}/${subrule}`;
  }

  const ruleMatch = nodeId.match(/^(\d+)\.(\d+)$/);
  if (ruleMatch) {
    const [, sectionId, rule] = ruleMatch;
    return `${buildSectionPath(sectionId!)}/${rule}`;
  }

  return nodeId;
}

/** Resolves a rule or subrule parent from its official number. */
function getRuleParentId(nodeId: string): string | null {
  const subruleMatch = nodeId.match(/^(\d+\.\d+)[a-z]+$/);
  if (subruleMatch) {
    return subruleMatch[1] ?? null;
  }

  const ruleMatch = nodeId.match(/^(\d+)\.\d+$/);
  if (ruleMatch) {
    return ruleMatch[1] ?? null;
  }

  return null;
}

/** Determines indentation from the official rule number. */
function getRuleLevel(nodeId: string): number {
  if (/^\d+\.\d+[a-z]+$/.test(nodeId)) {
    return 3;
  }

  if (/^\d+\.\d+$/.test(nodeId)) {
    return 2;
  }

  return 0;
}

/** Allocates source order within one parent container. */
function nextSiblingOrder(context: ParserContext, parentNodeId: string | null): number {
  const key = parentNodeId ?? '__root__';
  const next = (context.siblingMap.get(key) ?? 0) + 1;
  context.siblingMap.set(key, next);
  return next;
}

/** Creates a source node or enriches an existing structural container. */
function createNode(
  context: ParserContext,
  input: {
    nodeId:       string;
    nodeKind:     DocumentNodeKind;
    path:         string;
    level:        number;
    parentNodeId: string | null;
    content:      string | null;
  },
): ParsedDocumentNode {
  const node = context.nodeMap.get(input.nodeId);
  if (node) {
    if (input.content && input.content !== node.content) {
      node.content = input.content;
    }
    return node;
  }

  const next = {
    id:           buildVersionNodeId(context.versionId, input.nodeId),
    documentId:   context.documentId,
    versionId:    context.versionId,
    nodeId:       input.nodeId,
    nodeKind:     input.nodeKind,
    path:         input.path,
    level:        input.level,
    parentNodeId: input.parentNodeId,
    siblingOrder: nextSiblingOrder(context, input.parentNodeId),
    content:      input.content,
  } satisfies ParsedDocumentNode;

  context.nodeMap.set(next.nodeId, next);
  context.nodes.push(next);
  return next;
}

/** Creates a chapter or section container before its body. */
function ensureContainer(
  context: ParserContext,
  nodeId: string,
  path: string,
  options?: {
    level?:        number;
    parentNodeId?: string | null;
  },
): ParsedDocumentNode {
  const parent = options?.parentNodeId
    ? context.nodeMap.get(options.parentNodeId)
    : null;

  return createNode(context, {
    nodeId,
    nodeKind:     'heading',
    path,
    level:        options?.level ?? 0,
    parentNodeId: parent?.id ?? null,
    content:      null,
  });
}

/** Attaches the source heading text to its container. */
function ensureContainerTitle(
  context: ParserContext,
  nodeId: string,
  title: string,
): ParsedDocumentNode {
  const node = context.nodeMap.get(nodeId);
  if (!node) {
    throw new Error(`Missing container node: ${nodeId}`);
  }

  return createNode(context, {
    nodeId:       node.nodeId,
    nodeKind:     node.nodeKind,
    path:         node.path,
    level:        node.level,
    parentNodeId: node.parentNodeId,
    content:      title,
  });
}

/** Appends body paragraphs within a source container. */
function appendContentNode(
  context: ParserContext,
  parentNodeId: string,
  suffix: 'content' | `example.${number}`,
  nodeKind: Extract<DocumentNodeKind, 'content' | 'example'>,
  text: string,
): ParsedDocumentNode {
  const parent = context.nodeMap.get(parentNodeId);
  if (!parent) {
    throw new Error(`Missing parent node: ${parentNodeId}`);
  }

  const nodeId = `${parentNodeId}.${suffix}`;
  const pathSuffix = suffix.startsWith('example.')
    ? `example/${suffix.split('.')[1]}`
    : suffix;
  const existing = context.nodeMap.get(nodeId);

  if (existing) {
    existing.content = existing.content ? `${existing.content}\n\n${text}` : text;
    return existing;
  }

  return createNode(context, {
    nodeId,
    nodeKind,
    path:         `${parent.path}/${pathSuffix}`,
    level:        parent.level + 1,
    parentNodeId: parent.id,
    content:      text,
  });
}

/** Creates a numbered example under its rule or container. */
function createExampleNode(
  context: ParserContext,
  parentNodeId: string,
  text: string,
): ParsedDocumentNode {
  const count = (context.exampleCountMap.get(parentNodeId) ?? 0) + 1;
  context.exampleCountMap.set(parentNodeId, count);
  return appendContentNode(context, parentNodeId, `example.${count}`, 'example', text);
}

/** Recognizes short glossary and rule headings from source text. */
function isImplicitHeadingText(paragraph: string): boolean {
  if (!paragraph || paragraph.startsWith('Example:')) {
    return false;
  }

  if (paragraph.includes('. ') || /[.:'"”“’：]$/u.test(paragraph)) {
    return false;
  }

  return paragraph.length <= 120;
}

/** Recognizes glossary titles without rejecting quoted names or internal periods. */
function isGlossaryTerm(text: string): boolean {
  return text.length > 0 && text.length <= 120
    && !/[.?:;：]$/u.test(text) && !/^(Example:|[0-9]+[.)]\s)/u.test(text);
}

/** Collects a glossary term and its explanation in one node. */
function createGlossaryTermNode(
  context: ParserContext,
  term: string,
  parts: string[],
): ParsedDocumentNode {
  const slug = toTermSlug(term);
  const content = [term, ...parts].filter(Boolean).join('\n\n');
  const glossary = context.nodeMap.get('glossary');
  if (!glossary) {
    throw new Error('Missing glossary container');
  }

  return createNode(context, {
    nodeId:       `glossary.${slug}`,
    nodeKind:     'implicit_heading',
    path:         `glossary/${slug}`,
    level:        glossary.level + 1,
    parentNodeId: glossary.id,
    content,
  });
}

/** Parses official CR text into ordered source nodes and edition metadata. */
export function parseMagicCrDocument(input: {
  documentId?: string;
  versionTag:  string;
  content:     string;
}): ParsedDocumentSource {
  const documentId = input.documentId ?? 'magic-cr';
  const versionId = `${documentId}:${input.versionTag}`;
  const paragraphs = patchCrSource(input.versionTag, splitParagraphs(input.content));
  const context: ParserContext = {
    documentId,
    versionId,
    nodes:           [],
    nodeMap:         new Map(),
    siblingMap:      new Map(),
    exampleCountMap: new Map(),
  };

  let phase: 'frontmatter' | 'intro' | 'toc' | 'afterToc' | 'body' | 'glossary' | 'credits' = 'frontmatter';
  let effectiveDate: string | null = null;
  let introReady = false;
  let currentContainerId: string | null = null;
  let currentLeafNodeId: string | null = null;
  let glossaryTerm: string | null = null;
  let glossaryParts: string[] = [];

  /** Appends continuation text to the active body node. */
  const appendBodyText = (text: string): void => {
    if (
      currentLeafNodeId
      && ['content', 'example'].includes(context.nodeMap.get(currentLeafNodeId)?.nodeKind ?? '')
    ) {
      const node = context.nodeMap.get(currentLeafNodeId)!;
      node.content = node.content ? `${node.content}\n\n${text}` : text;
      return;
    }

    if (currentContainerId) {
      appendContentNode(context, currentContainerId, 'content', 'content', text);
      currentLeafNodeId = `${currentContainerId}.content`;
    }
  };

  /** Preserves source example boundaries within a paragraph. */
  const appendBodyLines = (lines: string[]): void => {
    for (const line of lines) {
      if (line.startsWith('Example:')) {
        const parentNodeId = currentLeafNodeId ?? currentContainerId ?? 'intro';
        const node = createExampleNode(context, parentNodeId, line);
        currentLeafNodeId = node.nodeId;
        continue;
      }

      appendBodyText(line);
    }
  };

  for (const rawParagraph of paragraphs) {
    const paragraph = normalizeParagraph(rawParagraph);
    const rawLines = rawParagraph
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    if (!paragraph) {
      continue;
    }

    const effectiveMatch = paragraph.match(effectiveDatePattern);
    if (effectiveMatch) {
      effectiveDate = effectiveMatch[1] ?? null;
      continue;
    }

    if (paragraph === 'Magic: The Gathering Comprehensive Rules') {
      continue;
    }

    if (phase === 'frontmatter') {
      if (paragraph === 'Introduction') {
        phase = 'intro';
        if (!introReady) {
          ensureContainer(context, 'intro', 'meta/intro');
          ensureContainerTitle(context, 'intro', 'Introduction');
          introReady = true;
        }
      }
      continue;
    }

    if (phase === 'intro') {
      if (paragraph === 'Contents') {
        phase = 'toc';
        continue;
      }

      if (rawLines.length > 0) {
        for (const line of rawLines) {
          if (line.startsWith('Example:')) {
            const node = createExampleNode(context, 'intro', line);
            currentLeafNodeId = node.nodeId;
            continue;
          }

          appendContentNode(context, 'intro', 'content', 'content', line);
          currentLeafNodeId = 'intro.content';
        }
        continue;
      }

      continue;
    }

    if (phase === 'toc') {
      if (paragraph === 'Credits') {
        phase = 'afterToc';
        continue;
      }

      continue;
    }

    if (phase === 'afterToc') {
      if (chapterPattern.test(paragraph)) {
        phase = 'body';
      } else {
        continue;
      }
    }

    if (phase === 'body') {
      const head = rawLines[0] ?? paragraph;
      const tail = rawLines.slice(1);

      if (paragraph === 'Glossary') {
        phase = 'glossary';
        currentContainerId = null;
        currentLeafNodeId = null;
        ensureContainer(context, 'glossary', 'glossary');
        ensureContainerTitle(context, 'glossary', 'Glossary');
        continue;
      }

      if (paragraph === 'Credits') {
        phase = 'credits';
        currentContainerId = 'credits';
        currentLeafNodeId = 'credits';
        ensureContainer(context, 'credits', 'credits');
        ensureContainerTitle(context, 'credits', 'Credits');
        continue;
      }

      if (chapterPattern.test(head)) {
        const chapterMatch = head.match(chapterPattern)!;
        const chapterId = chapterMatch[1]!;
        const title = chapterMatch[2]!;
        ensureContainer(context, chapterId, chapterId);
        ensureContainerTitle(context, chapterId, title);
        currentContainerId = chapterId;
        currentLeafNodeId = chapterId;
        appendBodyLines(tail);
        continue;
      }

      const sectionMatch = head.match(sectionPattern);
      if (sectionMatch) {
        const sectionId = sectionMatch[1]!;
        const title = sectionMatch[2]!;
        const chapterId = sectionId[0]!;
        ensureContainer(context, sectionId, buildSectionPath(sectionId), {
          level:        1,
          parentNodeId: chapterId,
        });
        ensureContainerTitle(context, sectionId, title);
        currentContainerId = sectionId;
        currentLeafNodeId = sectionId;
        appendBodyLines(tail);
        continue;
      }

      const subruleMatch = head.match(subrulePattern);
      if (subruleMatch) {
        const nodeId = subruleMatch[1]!;
        const text = subruleMatch[2]!;
        const parentNodeId = getRuleParentId(nodeId);
        const parent = parentNodeId
          ? context.nodeMap.get(parentNodeId)
          : null;
        createNode(context, {
          nodeId,
          nodeKind:     isImplicitHeadingText(text) ? 'implicit_heading' : 'content',
          path:         buildRulePath(nodeId),
          level:        getRuleLevel(nodeId),
          parentNodeId: parent?.id ?? null,
          content:      text,
        });
        currentContainerId = parentNodeId;
        currentLeafNodeId = nodeId;
        appendBodyLines(tail);
        continue;
      }

      const ruleMatch = head.match(rulePattern);
      if (ruleMatch) {
        const nodeId = ruleMatch[1]!;
        const text = ruleMatch[2]!;
        const parentNodeId = getRuleParentId(nodeId);
        const parent = parentNodeId
          ? context.nodeMap.get(parentNodeId)
          : null;
        createNode(context, {
          nodeId,
          nodeKind:     isImplicitHeadingText(text) ? 'implicit_heading' : 'content',
          path:         buildRulePath(nodeId),
          level:        getRuleLevel(nodeId),
          parentNodeId: parent?.id ?? null,
          content:      text,
        });
        currentContainerId = parentNodeId;
        currentLeafNodeId = nodeId;
        appendBodyLines(tail);
        continue;
      }

      appendBodyLines(rawLines);
      continue;
    }

    if (phase === 'glossary') {
      const glossaryLines = rawParagraph
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      const glossaryHead = glossaryLines[0] ?? '';
      const glossaryTail = normalizeParagraph(glossaryLines.slice(1).join('\n'));

      if (paragraph === 'Credits') {
        if (glossaryTerm) {
          createGlossaryTermNode(context, glossaryTerm, glossaryParts);
        }
        glossaryTerm = null;
        glossaryParts = [];
        phase = 'credits';
        currentContainerId = 'credits';
        currentLeafNodeId = 'credits';
        ensureContainer(context, 'credits', 'credits');
        ensureContainerTitle(context, 'credits', 'Credits');
        continue;
      }

      if (isGlossaryTerm(glossaryHead)) {
        if (glossaryTerm) {
          createGlossaryTermNode(context, glossaryTerm, glossaryParts);
        }
        glossaryTerm = glossaryHead;
        glossaryParts = glossaryTail ? [glossaryTail] : [];
        currentLeafNodeId = null;
        continue;
      }

      if (!glossaryTerm) {
        continue;
      }

      if (paragraph.startsWith('Example:')) {
        const termNodeId = `glossary.${toTermSlug(glossaryTerm)}`;
        if (!context.nodeMap.has(termNodeId)) {
          createGlossaryTermNode(context, glossaryTerm, glossaryParts);
        }
        const node = createExampleNode(context, termNodeId, paragraph);
        currentLeafNodeId = node.nodeId;
        continue;
      }

      glossaryParts.push(paragraph);
      continue;
    }

    if (phase === 'credits') {
      appendContentNode(context, 'credits', 'content', 'content', paragraph);
      currentLeafNodeId = 'credits.content';
      continue;
    }
  }

  if (phase === 'glossary' && glossaryTerm) {
    createGlossaryTermNode(context, glossaryTerm, glossaryParts);
  }

  return {
    documentId,
    versionId,
    versionTag:     input.versionTag,
    effectiveDate,
    publishedAt:    effectiveDate,
    parserStrategy: crParserVersion,
    nodes:          context.nodes,
  };
}
