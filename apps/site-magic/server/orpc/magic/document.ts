import { ORPCError, os } from '@orpc/server';
import { gunzipSync } from 'node:zlib';

import z from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { locale } from '#model/magic/schema/basic';
import {
  documentReaderChapter,
  documentReaderPage,
  documentReaderSummary,
} from '#model/magic/schema/document-page';
import { db } from '#db/db';
import {
  DocumentDefinition,
  DocumentNode,
  DocumentNodeContent,
  DocumentNodeEntity,
  DocumentVersion,
} from '#schema/magic/document';

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
  })
    .from(DocumentVersion)
    .where(eq(DocumentVersion.documentId, document.id))
    .orderBy(desc(DocumentVersion.versionTag));

  if (versions.length === 0) {
    throw new ORPCError('NOT_FOUND');
  }

  const latest = versions.find(version => version.lifecycle === 'active') ?? versions[0]!;
  const current = versionTag == null
    ? latest
    : versions.find(version => version.versionTag === versionTag);

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

export const documentTrpc = {
  reader,
  summary,
  chapter,
};

export const documentApi = {
  reader,
  summary,
  chapter,
};
