import { ORPCError, os } from '@orpc/server';
import { gunzipSync } from 'node:zlib';

import z from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { locale } from '#model/magic/schema/basic';
import type { NodeChangeType } from '#model/magic/schema/document';
import {
  documentDiffPage,
  documentReaderChapter,
  documentReaderPage,
  documentReaderSummary,
} from '#model/magic/schema/document-page';
import type { DocumentChangeTextBlock } from '#model/magic/schema/document-page';
import { db } from '#db/db';
import {
  DocumentDefinition,
  DocumentNode,
  DocumentNodeChange,
  DocumentNodeContent,
  DocumentNodeEntity,
  DocumentVersion,
  DocumentVersionImport,
} from '#schema/magic/document';
import { diffString } from '../../lib/diff';

function getNodeSerial(nodeId: string): string | null {
  if (/^\d+(?:\.\d+)?$/.test(nodeId)) {
    return `${nodeId}.`;
  }

  if (/^\d+\.\d+[a-z]$/.test(nodeId)) {
    return nodeId;
  }

  return null;
}

function getHeadingFallback(nodeId: string): string {
  if (nodeId === 'intro') {
    return 'Introduction';
  }

  if (nodeId === 'glossary') {
    return 'Glossary';
  }

  if (nodeId === 'credits') {
    return 'Credits';
  }

  return nodeId;
}

function getNavText(nodeId: string, kind: string, text: string | null): string | null {
  if (text) {
    if (kind === 'implicit_heading' || kind === 'content') {
      return text.split('\n\n')[0]?.trim() ?? text;
    }

    return text;
  }

  if (kind === 'heading') {
    return getHeadingFallback(nodeId);
  }

  return null;
}

const readerInput = z.object({
  slug:       z.string(),
  versionTag: z.string().optional(),
  locale:     locale.default('en'),
});

type ReaderInput = z.infer<typeof readerInput>;

async function getReaderPage(input: ReaderInput) {
  const { slug, versionTag, locale } = input;

  const document = await db.select({
    id:           DocumentDefinition.id,
    slug:         DocumentDefinition.slug,
    name:         DocumentDefinition.name,
    sourceLocale: DocumentDefinition.sourceLocale,
  })
    .from(DocumentDefinition)
    .where(eq(DocumentDefinition.slug, slug))
    .limit(1)
    .then(rows => rows[0]);

  if (!document) {
    throw new ORPCError('NOT_FOUND');
  }

  const versions = await db.select({
    id:            DocumentVersion.id,
    versionTag:    DocumentVersion.versionTag,
    effectiveDate: DocumentVersion.effectiveDate,
    publishedAt:   DocumentVersion.publishedAt,
    lifecycle:     DocumentVersion.lifecycleStatus,
    importStatus:  DocumentVersionImport.importStatus,
  })
    .from(DocumentVersion)
    .leftJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
    .where(eq(DocumentVersion.documentId, document.id))
    .orderBy(desc(DocumentVersion.versionTag));

  const completedVersions = versions.filter(version => version.importStatus === 'completed');

  if (completedVersions.length === 0) {
    throw new ORPCError('NOT_FOUND');
  }

  const latest = completedVersions.find(version => version.lifecycle === 'active') ?? completedVersions[0]!;
  const current = versionTag == null
    ? latest
    : completedVersions.find(version => version.versionTag === versionTag);

  if (!current) {
    throw new ORPCError('NOT_FOUND');
  }

  const nodes = await db.select({
    id:           DocumentNode.id,
    nodeId:       DocumentNode.nodeId,
    nodeKind:     DocumentNode.nodeKind,
    path:         DocumentNode.path,
    level:        DocumentNode.level,
    parentNodeId: DocumentNode.parentNodeId,
    siblingOrder: DocumentNode.siblingOrder,
    entityId:     DocumentNode.entityId,
  })
    .from(DocumentNode)
    .where(eq(DocumentNode.versionId, current.id));

  const nodeIds = nodes.map(node => node.id);
  const entityIds = [...new Set(nodes.map(node => node.entityId))];

  const contents = nodeIds.length === 0
    ? []
    : await db.select({
      documentNodeId: DocumentNodeContent.documentNodeId,
      locale:         DocumentNodeContent.locale,
      content:        DocumentNodeContent.content,
      status:         DocumentNodeContent.status,
    })
      .from(DocumentNodeContent)
      .where(and(
        inArray(DocumentNodeContent.documentNodeId, nodeIds),
        inArray(DocumentNodeContent.locale, [...new Set([locale, document.sourceLocale])]),
      ));

  const entities = entityIds.length === 0
    ? []
    : await db.select({
      id:             DocumentNodeEntity.id,
      totalRevisions: DocumentNodeEntity.totalRevisions,
    })
      .from(DocumentNodeEntity)
      .where(inArray(DocumentNodeEntity.id, entityIds));

  const entityMap = new Map(entities.map(entity => [entity.id, entity]));
  const contentMap = new Map<string, Array<{
    locale:  string;
    content: string;
    status:  'source' | 'draft' | 'reviewed' | 'published' | 'stale';
  }>>();

  for (const item of contents) {
    const list = contentMap.get(item.documentNodeId) ?? [];
    list.push({
      locale:  item.locale,
      content: gunzipSync(Buffer.from(item.content)).toString('utf8'),
      status:  item.status,
    });
    contentMap.set(item.documentNodeId, list);
  }

  const pickContent = (documentNodeId: string) => {
    const items = contentMap.get(documentNodeId) ?? [];
    const exact = items.find(item => item.locale === locale);

    if (exact) {
      return {
        locale:     exact.locale,
        content:    exact.content,
        status:     exact.status,
        isFallback: false,
      };
    }

    const fallback = items.find(item => item.locale === document.sourceLocale);

    if (fallback) {
      return {
        locale:     fallback.locale,
        content:    fallback.content,
        status:     fallback.status,
        isFallback: fallback.locale !== locale,
      };
    }

    return {
      locale,
      content:    null,
      status:     'source' as const,
      isFallback: false,
    };
  };

  const visibleNodeMap = new Map(nodes.map(node => [node.id, node]));
  const childMap = new Map<string | null, typeof nodes>();

  for (const node of nodes) {
    const key = node.parentNodeId ?? null;
    const list = childMap.get(key) ?? [];
    list.push(node);
    childMap.set(key, list);
  }

  const walk = (parentId: string | null): typeof nodes => {
    const list = [...(childMap.get(parentId) ?? [])]
      .sort((left, right) => left.siblingOrder - right.siblingOrder);

    return list.flatMap(node => [node, ...walk(node.id)]);
  };

  const orderedNodes = walk(null);

  const sections = orderedNodes.map(node => {
    const picked = pickContent(node.id);
    const parent = node.parentNodeId ? visibleNodeMap.get(node.parentNodeId) : null;

    return {
      nodeId:       node.nodeId,
      entityId:     node.entityId,
      kind:         node.nodeKind,
      serial:       getNodeSerial(node.nodeId),
      text:         picked.content,
      navText:      getNavText(node.nodeId, node.nodeKind, picked.content),
      path:         node.path,
      level:        node.level,
      parentNodeId: parent?.nodeId ?? null,
      siblingOrder: node.siblingOrder,
      latestChange: null,
      historyCount: entityMap.get(node.entityId)?.totalRevisions ?? 1,
      localeState:  {
        locale:     picked.locale,
        status:     picked.status,
        isFallback: picked.isFallback,
      },
    };
  });

  type OutlineNode = {
    key:       string;
    nodeId:    string;
    entityId:  string;
    label:     string;
    serial:    string | null;
    level:     number;
    kind:      'heading' | 'implicit_heading' | 'content' | 'example';
    children?: OutlineNode[];
  };

  const outlineSections = sections.filter(section =>
    section.kind === 'heading' || section.kind === 'implicit_heading');

  const outlineMap = new Map<string, OutlineNode>();
  for (const section of outlineSections) {
    outlineMap.set(section.nodeId, {
      key:      section.nodeId,
      nodeId:   section.nodeId,
      entityId: section.entityId,
      label:    section.navText ?? section.nodeId,
      serial:   section.serial,
      level:    section.level,
      kind:     section.kind,
      children: [],
    });
  }

  const outline: OutlineNode[] = [];
  for (const section of outlineSections) {
    const item = outlineMap.get(section.nodeId)!;
    if (!section.parentNodeId) {
      outline.push(item);
      continue;
    }

    const parent = outlineMap.get(section.parentNodeId);
    if (!parent) {
      outline.push(item);
      continue;
    }

    (parent.children ??= []).push(item);
  }

  return {
    document: {
      id:   document.id,
      slug: document.slug,
      name: document.name,
    },
    version: {
      id:            current.id,
      versionTag:    current.versionTag,
      effectiveDate: current.effectiveDate,
      publishedAt:   current.publishedAt,
      isLatest:      current.id === latest.id,
    },
    versions: versions.map(version => ({
      id:            version.id,
      versionTag:    version.versionTag,
      effectiveDate: version.effectiveDate,
      publishedAt:   version.publishedAt,
    })),
    outline,
    sections,
  };
}

const reader = os
  .route({
    method:      'GET',
    description: 'Get document reader page data',
    tags:        ['Magic', 'Document'],
  })
  .input(readerInput)
  .output(documentReaderPage)
  .handler(async ({ input }) => {
    return await getReaderPage(input);
  })
  .callable();

const summary = os
  .route({
    method:      'GET',
    description: 'Get document reader summary data',
    tags:        ['Magic', 'Document'],
  })
  .input(readerInput)
  .output(documentReaderSummary)
  .handler(async ({ input }) => {
    const page = await getReaderPage(input);

    return {
      document: page.document,
      version:  page.version,
      versions: page.versions,
      outline:  page.outline,
    };
  })
  .callable();

const chapter = os
  .route({
    method:      'GET',
    description: 'Get document reader chapter data',
    tags:        ['Magic', 'Document'],
  })
  .input(readerInput.extend({
    chapterNodeId: z.string(),
  }))
  .output(documentReaderChapter)
  .handler(async ({ input }) => {
    const page = await getReaderPage(input);
    const current = page.sections.find(section => section.nodeId === input.chapterNodeId);

    if (!current) {
      throw new ORPCError('NOT_FOUND');
    }

    const prefix = `${current.path}/`;

    return {
      chapterNodeId: input.chapterNodeId,
      sections:      page.sections.filter(section =>
        section.path === current.path || section.path.startsWith(prefix)),
    };
  })
  .callable();

const compareInput = z.object({
  slug:           z.string(),
  fromVersionTag: z.string(),
  toVersionTag:   z.string(),
  locale:         locale.default('en'),
});

function diffToBlocks(oldText: string, newText: string): DocumentChangeTextBlock[] {
  const parts = diffString(oldText, newText);
  const blocks: DocumentChangeTextBlock[] = [];

  for (const part of parts) {
    if (typeof part === 'string') {
      blocks.push({ type: 'common', text: part });
    } else {
      if (part[0]) {
        blocks.push({ type: 'removed', text: part[0] });
      }

      if (part[1]) {
        blocks.push({ type: 'added', text: part[1] });
      }
    }
  }

  return blocks;
}

const compare = os
  .route({
    method:      'GET',
    description: 'Compare two document versions',
    tags:        ['Magic', 'Document'],
  })
  .input(compareInput)
  .output(documentDiffPage)
  .handler(async ({ input }) => {
    const { slug, fromVersionTag, toVersionTag, locale } = input;

    // 1. Load document definition
    const document = await db.select({
      id:           DocumentDefinition.id,
      slug:         DocumentDefinition.slug,
      name:         DocumentDefinition.name,
      sourceLocale: DocumentDefinition.sourceLocale,
    })
      .from(DocumentDefinition)
      .where(eq(DocumentDefinition.slug, slug))
      .limit(1)
      .then(rows => rows[0]);

    if (!document) {
      throw new ORPCError('NOT_FOUND');
    }

    // 2. Load versions (only completed)
    const versions = await db.select({
      id:            DocumentVersion.id,
      versionTag:    DocumentVersion.versionTag,
      effectiveDate: DocumentVersion.effectiveDate,
      publishedAt:   DocumentVersion.publishedAt,
      importStatus:  DocumentVersionImport.importStatus,
    })
      .from(DocumentVersion)
      .leftJoin(DocumentVersionImport, eq(DocumentVersionImport.versionId, DocumentVersion.id))
      .where(eq(DocumentVersion.documentId, document.id))
      .orderBy(desc(DocumentVersion.versionTag));

    const completedVersions = versions.filter(v => v.importStatus === 'completed');
    const fromVersion = completedVersions.find(v => v.versionTag === fromVersionTag);
    const toVersion = completedVersions.find(v => v.versionTag === toVersionTag);

    if (!fromVersion || !toVersion) {
      throw new ORPCError('NOT_FOUND');
    }

    // 3. Load all nodes for both versions + changes in parallel
    const [fromAllNodes, toAllNodes, changes] = await Promise.all([
      db.select({
        id:           DocumentNode.id,
        nodeId:       DocumentNode.nodeId,
        entityId:     DocumentNode.entityId,
        nodeKind:     DocumentNode.nodeKind,
        path:         DocumentNode.path,
        level:        DocumentNode.level,
        parentNodeId: DocumentNode.parentNodeId,
        siblingOrder: DocumentNode.siblingOrder,
      })
        .from(DocumentNode)
        .where(eq(DocumentNode.versionId, fromVersion.id)),

      db.select({
        id:           DocumentNode.id,
        nodeId:       DocumentNode.nodeId,
        entityId:     DocumentNode.entityId,
        nodeKind:     DocumentNode.nodeKind,
        path:         DocumentNode.path,
        level:        DocumentNode.level,
        parentNodeId: DocumentNode.parentNodeId,
        siblingOrder: DocumentNode.siblingOrder,
      })
        .from(DocumentNode)
        .where(eq(DocumentNode.versionId, toVersion.id)),

      db.select({
        id:               DocumentNodeChange.id,
        entityId:         DocumentNodeChange.entityId,
        fromNodeRefId:    DocumentNodeChange.fromNodeRefId,
        toNodeRefId:      DocumentNodeChange.toNodeRefId,
        type:             DocumentNodeChange.type,
        confidenceScore:  DocumentNodeChange.confidenceScore,
        reviewStateCache: DocumentNodeChange.reviewStateCache,
        details:          DocumentNodeChange.details,
      })
        .from(DocumentNodeChange)
        .where(and(
          eq(DocumentNodeChange.documentId, document.id),
          eq(DocumentNodeChange.fromVersionId, fromVersion.id),
          eq(DocumentNodeChange.toVersionId, toVersion.id),
        )),
    ]);

    // Order by parentNodeId + siblingOrder (depth-first walk)
    const walkNodes = (nodes: typeof fromAllNodes) => {
      const childMap = new Map<string | null, typeof nodes>();

      for (const node of nodes) {
        const key = node.parentNodeId ?? null;
        const list = childMap.get(key) ?? [];
        list.push(node);
        childMap.set(key, list);
      }

      const result: typeof nodes = [];

      const walk = (parentId: string | null) => {
        const children = [...(childMap.get(parentId) ?? [])]
          .sort((a, b) => a.siblingOrder - b.siblingOrder);

        for (const child of children) {
          result.push(child);
          walk(child.id);
        }
      };

      walk(null);
      return result;
    };

    const orderedFrom = walkNodes(fromAllNodes);
    const orderedTo = walkNodes(toAllNodes);

    // Build change lookup maps keyed by node DB id
    const changeByToRef = new Map<string, typeof changes[0]>();
    const changeByFromRef = new Map<string, typeof changes[0]>();

    for (const c of changes) {
      if (c.toNodeRefId) changeByToRef.set(c.toNodeRefId, c);
      if (c.fromNodeRefId) changeByFromRef.set(c.fromNodeRefId, c);
    }

    // 4. Load content for changed nodes only
    const changedNodeIds = [
      ...new Set(
        changes.flatMap(c => [c.fromNodeRefId, c.toNodeRefId].filter(Boolean) as string[]),
      ),
    ];

    const contentRows = changedNodeIds.length === 0
      ? []
      : await db.select({
        documentNodeId: DocumentNodeContent.documentNodeId,
        locale:         DocumentNodeContent.locale,
        content:        DocumentNodeContent.content,
      })
        .from(DocumentNodeContent)
        .where(and(
          inArray(DocumentNodeContent.documentNodeId, changedNodeIds),
          inArray(DocumentNodeContent.locale, [...new Set([locale, document.sourceLocale])]),
        ));

    const contentMap = new Map<string, string>();

    for (const row of contentRows) {
      // Prefer requested locale, fallback to source
      if (row.locale === locale || !contentMap.has(row.documentNodeId)) {
        contentMap.set(row.documentNodeId, gunzipSync(Buffer.from(row.content)).toString('utf8'));
      }
    }

    // 5. Compute insertion points for removed nodes
    // Removed nodes exist only in the from-version; find where they should appear
    // relative to surviving sections in the to-version.
    const toEntitySet = new Set(orderedTo.map(n => n.entityId));
    const toEntityIndex = new Map(orderedTo.map((n, i) => [n.entityId, i]));
    const fromIndexMap = new Map(orderedFrom.map((n, i) => [n.id, i]));

    // Map: toIndex → removed from-nodes to insert before that index
    const removedInsertions = new Map<number, typeof orderedFrom>();

    for (const fromNode of orderedFrom) {
      if (!changeByFromRef.has(fromNode.id) || toEntitySet.has(fromNode.entityId)) {
        continue;
      }

      // This is a removed node. Find the next entity after it in from-order
      // that still exists in to-version.
      const fromIdx = fromIndexMap.get(fromNode.id)!;
      let insertBefore = orderedTo.length;

      for (let k = fromIdx + 1; k < orderedFrom.length; k++) {
        const idx = toEntityIndex.get(orderedFrom[k]!.entityId);

        if (idx !== undefined) {
          insertBefore = idx;
          break;
        }
      }

      const list = removedInsertions.get(insertBefore) ?? [];
      list.push(fromNode);
      removedInsertions.set(insertBefore, list);
    }

    // 6. Build merged diff rows
    const buildSection = (node: typeof orderedFrom[0]) => ({
      nodeId: node.nodeId,
      kind:   node.nodeKind,
      serial: getNodeSerial(node.nodeId),
      text:   contentMap.get(node.id) ?? null,
      level:  node.level,
    });

    const rows: Array<
      | { kind: 'omitted', count: number }
      | {
        kind:     'change';
        type:     NodeChangeType;
        from:     ReturnType<typeof buildSection> | null;
        to:       ReturnType<typeof buildSection> | null;
        textDiff: { mode: 'inline', blocks: DocumentChangeTextBlock[] } | null;
      }
    > = [];
    let omittedCount = 0;

    const flushOmitted = () => {
      if (omittedCount > 0) {
        rows.push({ kind: 'omitted', count: omittedCount });
        omittedCount = 0;
      }
    };

    const fromById = new Map(fromAllNodes.map(n => [n.id, n]));

    for (let i = 0; i <= orderedTo.length; i++) {
      // Insert removed nodes that belong before this position
      const removedHere = removedInsertions.get(i);

      if (removedHere) {
        for (const removed of removedHere) {
          flushOmitted();
          rows.push({
            kind:     'change',
            type:     changeByFromRef.get(removed.id)!.type,
            from:     buildSection(removed),
            to:       null,
            textDiff: null,
          });
        }
      }

      if (i >= orderedTo.length) break;

      const toNode = orderedTo[i]!;
      const change = changeByToRef.get(toNode.id);

      if (change) {
        flushOmitted();
        const fromNode = change.fromNodeRefId ? fromById.get(change.fromNodeRefId) : null;

        let textDiff: { mode: 'inline', blocks: DocumentChangeTextBlock[] } | null = null;

        if (
          (change.type === 'modified' || change.type === 'renamed_modified')
          && fromNode
        ) {
          const oldText = contentMap.get(fromNode.id);
          const newText = contentMap.get(toNode.id);

          if (oldText != null && newText != null) {
            textDiff = { mode: 'inline' as const, blocks: diffToBlocks(oldText, newText) };
          }
        }

        rows.push({
          kind: 'change',
          type: change.type,
          from: fromNode ? buildSection(fromNode) : null,
          to:   buildSection(toNode),
          textDiff,
        });
      } else {
        omittedCount++;
      }
    }

    flushOmitted();

    // 7. Compute stats
    const stats = {
      added:           0,
      removed:         0,
      modified:        0,
      moved:           0,
      renamed:         0,
      renamedModified: 0,
      split:           0,
      merged:          0,
    };

    for (const c of changes) {
      switch (c.type) {
      case 'added': stats.added++;
        break;
      case 'removed': stats.removed++;
        break;
      case 'modified': stats.modified++;
        break;
      case 'moved': stats.moved++;
        break;
      case 'renamed': stats.renamed++;
        break;
      case 'renamed_modified': stats.renamedModified++;
        break;
      case 'split': stats.split++;
        break;
      case 'merged': stats.merged++;
        break;
      }
    }

    return {
      document: {
        id:   document.id,
        slug: document.slug,
        name: document.name,
      },
      fromVersion: {
        id:            fromVersion.id,
        versionTag:    fromVersion.versionTag,
        effectiveDate: fromVersion.effectiveDate,
        publishedAt:   fromVersion.publishedAt,
      },
      toVersion: {
        id:            toVersion.id,
        versionTag:    toVersion.versionTag,
        effectiveDate: toVersion.effectiveDate,
        publishedAt:   toVersion.publishedAt,
      },
      stats,
      rows,
    };
  })
  .callable();

export const documentTrpc = {
  reader,
  summary,
  chapter,
  compare,
};

export const documentApi = {
  reader,
  summary,
  chapter,
  compare,
};
