import { createHash } from 'node:crypto';

import type { DocumentOutlineItem } from '@tcg-cards/model/magic/schema/document-page';
import type { SourceFile } from '@tcg-cards/model/magic/schema/document-content';
import { matchRevisionNodes } from './matcher';
import { importText } from './text';
import { documentSettings, sourceFile } from '@tcg-cards/model/magic/schema/document-content';
import { createTranslationOperations } from './translations';
import { createAuthoringOperations } from './authoring';
import { parseMagicCrDocument } from './parser';
import type { DocumentStore, Node, Revision } from './store';

/** Selects storage ownership and the authenticated user for document operations. */
export interface DocumentContext {
  track: 'local' | 'remote';
  actorId?: string;
}

/** Provides the document operation boundary shared by imports and serving adapters. */
export function createDocumentService(store: DocumentStore, context: DocumentContext) {
  return {
    ...createAuthoringOperations(store, context),
    ...createTranslationOperations(store, context),
    async importCr(input: { content: string; versionTag?: string; files?: SourceFile[] }) {
      if (context.track !== 'local') throw new Error('Static imports require local storage');
      const normalized = input.content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd() + '\n';
      const dateMatch = normalized.match(/These rules are effective as of (.+)\./i);
      const date = dateMatch ? new Date(`${dateMatch[1]} UTC`) : null;
      const effectiveDate = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
      const versionTag = input.versionTag?.replaceAll('-', '') ?? effectiveDate?.replaceAll('-', '');
      if (!versionTag) throw new Error('Cannot determine the CR version');
      if (effectiveDate && versionTag.replaceAll('-', '') !== effectiveDate.replaceAll('-', '')) throw new Error('CR version does not match its effective date');
      const parsed = parseMagicCrDocument({ documentId: 'magic-cr', versionTag, content: normalized });
      if (!parsed.nodes.some(node => /^\d+\.\d+/.test(node.nodeId))) throw new Error('Parsed document has no rule nodes');
      const revisionId = `magic-cr:${createHash('sha256').update(normalized).digest('hex')}`;
      const releaseId = `magic-cr:${versionTag}`;
      return store.transaction('magic-cr', async tx => {
        const existingRelease = (await tx.releases('magic-cr')).find(row => row.id === releaseId);
        if (existingRelease && existingRelease.sourceRevisionId !== revisionId) throw new Error('Official release already exists with different content');
        const existing = await tx.revision(revisionId);
        if (existing) return { documentId: 'magic-cr', revisionId, releaseId, versionTag, effectiveDate, totalNodes: existing.nodes.length };
        const at = new Date();
        const document = await tx.document('magic-cr');
        await tx.putDocument(document ?? {
          id: 'magic-cr', slug: 'magic-cr', title: 'Comprehensive Rules', sourceLanguage: 'en',
          origin: 'static', staticKey: 'magic-cr', visibility: 'public',
          settings: documentSettings.parse({ outline: true, compare: true }),
          createdAt: at, updatedAt: at, deletedAt: null,
        });
        const ids = new Map(parsed.nodes.map(node => [node.id, `${revisionId}/${node.nodeId}`]));
        const anchors = new Set(parsed.nodes.map(node => node.nodeId));
        const previousRelease = (await tx.releases('magic-cr')).filter(row => !row.deletedAt && row.versionTag < versionTag).sort((a, b) => b.versionTag.localeCompare(a.versionTag))[0];
        const previousRevision = previousRelease ? await tx.revision(previousRelease.sourceRevisionId) : undefined;
        const assignments = previousRevision ? matchRevisionNodes(previousRevision, parsed.nodes, revisionId).entityAssignments : undefined;
        const nodes: Node[] = parsed.nodes.map(node => ({
          id: ids.get(node.id)!, revisionId, nodeKey: assignments?.get(node.nodeId)?.entityId ?? node.nodeId, kind: node.nodeKind,
          anchor: node.nodeId, path: node.path, level: node.level,
          parentId: node.parentNodeId ? ids.get(node.parentNodeId) ?? null : null,
          siblingOrder: node.siblingOrder, ...importText(node.content ?? '', anchors),
          sourceNodeId: null, sourceRevisionId: null, translationMethod: null, reviewStatus: null,
        }));
        await tx.putRevision({
          id: revisionId, documentId: 'magic-cr', translationId: null, sourceRevisionId: null,
          title: 'Comprehensive Rules', language: 'en', createdAt: at, deletedAt: null, nodes,
        });
        await tx.putRelease({
          id: releaseId, documentId: 'magic-cr', versionTag, sourceRevisionId: revisionId,
          publishedAt: effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`) : at,
          effectiveDate, files: (input.files ?? []).map(file => sourceFile.parse(file)), deletedAt: null,
        });
        return { documentId: 'magic-cr', revisionId, releaseId, versionTag, effectiveDate, totalNodes: nodes.length };
      });
    },
    async retireRelease(input: { documentId: string; releaseId: string }) {
      if (context.track !== 'local') throw new Error('Static releases are maintained locally');
      return store.transaction(input.documentId, async tx => {
        const document = await tx.document(input.documentId);
        if (!document || document.origin !== 'static') throw new Error('Document not found');
        const release = (await tx.releases(input.documentId)).find(row => row.id === input.releaseId);
        if (!release) throw new Error('Release not found');
        await tx.putRelease({ ...release, deletedAt: new Date() });
      });
    },
    async search(input: { query: string; slug?: string; language?: string; limit?: number }) {
      const query = input.query.trim();
      if (!query) return [];
      return store.searchPublished({ ...input, query, limit: Math.max(1, Math.min(100, input.limit ?? 30)) });
    },
    async read(input: { slug: string; versionTag?: string; locale?: string }) {
      const document = (await store.documents()).find(row => (row.slug === input.slug || row.id === input.slug) && !row.deletedAt);
      if (!document || (document.visibility === 'private' && document.authorId !== context.actorId)) throw new Error('Document not found');
      const releases = (await store.releases(document.id)).filter(row => !row.deletedAt).sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || b.versionTag.localeCompare(a.versionTag));
      const release = input.versionTag ? releases.find(row => row.versionTag === input.versionTag || row.id === input.versionTag) : releases[0];
      if (!release) throw new Error('Release not found');
      const source = await store.revision(release.sourceRevisionId);
      if (!source) throw new Error('Release content missing');
      let translated: Revision | undefined;
      if (input.locale && input.locale !== source.language) {
        const translation = (await store.translations(document.id)).find(row => row.language === input.locale);
        const binding = translation ? (await store.releaseTranslations(release.id)).find(row => row.translationId === translation.id) : undefined;
        if (binding) translated = await store.revision(binding.revisionId);
      }
      return buildReader(document, release, releases, source, translated, input.locale);
    },
  };
}

/** Builds the existing reader contract from an immutable source revision. */
function buildReader(
  document: Awaited<ReturnType<DocumentStore['document']>> & {},
  release: Awaited<ReturnType<DocumentStore['releases']>>[number],
  releases: Awaited<ReturnType<DocumentStore['releases']>>,
  source: Revision,
  translated?: Revision,
  requestedLanguage?: string,
) {
  const translations = new Map(translated?.nodes.map(node => [node.sourceNodeId, node]) ?? []);
  const sections = orderedNodes(source.nodes).map(node => ({
    nodeId: node.anchor ?? node.nodeKey, entityId: node.nodeKey, kind: node.kind,
    serial: /^\d+(?:\.\d+[a-z]?)?$/.test(node.anchor ?? '') ? `${node.anchor}${/[a-z]$/.test(node.anchor!) ? '' : '.'}` : null,
    text: translations.get(node.id)?.rawText ?? (node.rawText || null),
    markers: translations.get(node.id)?.markers ?? node.markers,
    translationMethod: translations.get(node.id)?.translationMethod ?? null,
    reviewStatus: translations.get(node.id)?.reviewStatus ?? null,
    navText: translations.get(node.id)?.rawText ?? (node.rawText || null),
    path: node.path, level: node.level,
    parentNodeId: source.nodes.find(parent => parent.id === node.parentId)?.anchor ?? null,
    siblingOrder: node.siblingOrder, latestChange: null, historyCount: 0,
    localeState: {
      locale: translations.has(node.id) ? translated!.language : source.language,
      status: translations.has(node.id) ? 'published' as const : 'source' as const,
      isFallback: requestedLanguage != null && requestedLanguage !== source.language && !translations.has(node.id),
    },
  }));
  const outline: DocumentOutlineItem[] = sections.filter(node => node.kind === 'heading' || node.kind === 'implicit_heading').map(node => ({
    key: node.nodeId, nodeId: node.nodeId, entityId: node.entityId,
    label: `${node.serial ? `${node.serial} ` : ''}${node.text ?? node.nodeId}`,
    serial: node.serial, level: node.level, kind: node.kind,
    children: [],
  }));
  const roots = [] as typeof outline;
  const byId = new Map(outline.map(node => [node.nodeId, node]));
  for (const item of outline) {
    const parentId = sections.find(node => node.nodeId === item.nodeId)?.parentNodeId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) (parent.children ??= []).push(item); else roots.push(item);
  }
  const version = (row: typeof release) => ({ id: row.id, versionTag: row.versionTag, effectiveDate: row.effectiveDate ?? row.publishedAt.toISOString().slice(0, 10), publishedAt: row.publishedAt.toISOString().slice(0, 10) });
  return {
    document: { id: document.id, slug: document.slug, name: source.title, origin: document.origin, settings: document.settings },
    version: { ...version(release), isLatest: release.id === releases[0]?.id },
    versions: releases.map(version), files: release.files, outline: document.settings.outline ? roots : [], sections,
  };
}

/** Preserves authored sibling order instead of sorting section labels alphabetically. */
function orderedNodes(nodes: Node[]): Node[] {
  const children = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  const result: Node[] = [];
  const visited = new Set<string>();
  /** Walks the immutable tree in document order. */
  function visit(parentId: string | null) {
    for (const node of (children.get(parentId) ?? []).sort((a, b) => a.siblingOrder - b.siblingOrder || a.id.localeCompare(b.id))) {
      if (visited.has(node.id)) throw new Error('Node parent cycle');
      visited.add(node.id);
      result.push(node);
      visit(node.id);
    }
  }
  visit(null);
  if (result.length !== nodes.length) throw new Error('Node parent missing');
  return result;
}
