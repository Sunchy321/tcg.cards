import { createHash } from 'node:crypto';

import type { DocumentOutlineItem } from '@tcg-cards/model/magic/schema/document-page';
import type { SourceFile } from '@tcg-cards/model/magic/schema/document-content';
import { matchRevisionNodes } from './matcher';
import { importText } from './text';
import { orderedNodes } from './nodes';
import { documentSettings, sourceFile } from '@tcg-cards/model/magic/schema/document-content';
import { createTranslationOperations } from './translations';
import { createAuthoringOperations } from './authoring';
import { parseMagicCrDocument } from './parser';
import { alignCrTranslation, CrTranslationError } from './community';
import { latestCrTranslation } from './community-latest';
import { sameRevision } from './reparse';
import { calculateStatistics } from './statistics';
import type { DocumentStore, Node, Revision } from './store';

/** Selects storage ownership and the authenticated user for document operations. */
export interface DocumentContext {
  track: 'local' | 'remote';
  actorId?: string;
}

/** True when saved nodes carry the same rule text as a fresh parse, whatever capture whitespace or node order. */
function sameRuleContent(nodes: Node[], parsed: ReturnType<typeof parseMagicCrDocument>['nodes'], anchors: Set<string>): boolean {
  if (nodes.length !== parsed.length) return false;
  const saved = new Map(nodes.map(node => [node.anchor, node.rawText]));
  return parsed.every(node => saved.get(node.nodeId) === importText(node.content ?? '', anchors).rawText);
}

/** Provides the document operation boundary shared by imports and serving adapters. */
export function createDocumentService(store: DocumentStore, context: DocumentContext) {
  return {
    ...createAuthoringOperations(store, context),
    ...createTranslationOperations(store, context),
    /** Imports a community edition only after its exact English release has been prepared. */
    async importCrTranslation(input: { versionTag: string; content: unknown; editions?: unknown[] }) {
      if (context.track !== 'local') throw new Error('Static translations require local storage');
      const versionTag = input.versionTag.replaceAll('-', '');
      return store.transaction('magic-cr', async tx => {
        const release = (await tx.releases('magic-cr')).find(row => row.versionTag === versionTag && row.deletedAt == null);
        if (release == null) throw new CrTranslationError([`${versionTag}：请先通过英文规则导入准备此版本。`]);
        const source = await tx.revision(release.sourceRevisionId);
        if (source == null || source.language !== 'en' || source.translationId != null) {
          throw new CrTranslationError([`${versionTag}：此版本缺少有效的英文原文。`]);
        }
        // Validate the original edition first; newer translations must not hide source defects.
        const original = alignCrTranslation(input.content, source, versionTag);
        const aligned = input.editions == null ? original
          : alignCrTranslation(latestCrTranslation(input.content, input.editions), source, versionTag);
        const translations = createTranslationOperations(tx, context);
        const revision = await translations.saveTranslation(aligned);
        await translations.selectTranslation({ documentId: 'magic-cr', releaseId: release.id, revisionId: revision.id });
        return { versionTag, releaseId: release.id, revisionId: revision.id, totalNodes: revision.nodes.length };
      });
    },
    /** Imports authoritative CR text with its proven official date and retained original files. */
    async importCr(input: { content: string; versionTag?: string; files?: SourceFile[] }) {
      if (context.track !== 'local') throw new Error('Static imports require local storage');
      const normalized = input.content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trimEnd() + '\n';
      // Historical originals say 'current', and some official TXT headers omit the final period.
      const dateMatch = normalized.match(/^These rules are (?:effective|current) as of ([A-Za-z]+ \d{1,2}, \d{4})\.?\s*$/im);
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
        const anchors = new Set(parsed.nodes.map(node => node.nodeId));
        // Official TXT and mirror captures differ in blank-line whitespace; parsed rule content decides identity.
        let contentId = revisionId;
        if (existingRelease && existingRelease.sourceRevisionId !== revisionId) {
          const saved = await tx.revision(existingRelease.sourceRevisionId);
          if (saved == null || !sameRuleContent(saved.nodes, parsed.nodes, anchors)) throw new Error('Official release already exists with different content');
          contentId = existingRelease.sourceRevisionId;
        }
        const existing = await tx.revision(contentId);
        const at = new Date();
        const document = await tx.document('magic-cr');
        await tx.putDocument(document ?? {
          id: 'magic-cr', slug: 'magic-cr', title: 'Comprehensive Rules', sourceLanguage: 'en',
          origin: 'static', staticKey: 'magic-cr', visibility: 'public',
          settings: documentSettings.parse({ outline: true, compare: true, historyPublic: true }),
          createdAt: at, updatedAt: at, deletedAt: null,
        });
        const ids = new Map(parsed.nodes.map(node => [node.id, `${contentId}/${node.nodeId}`]));
        const previousRelease = (await tx.releases('magic-cr')).filter(row => !row.deletedAt && row.versionTag < versionTag).sort((a, b) => b.versionTag.localeCompare(a.versionTag))[0];
        const previousRevision = previousRelease ? await tx.revision(previousRelease.sourceRevisionId) : undefined;
        const assignments = previousRevision ? matchRevisionNodes(previousRevision, parsed.nodes, contentId).entityAssignments : undefined;
        const existingKeys = new Map(existing?.nodes.map(node => [node.anchor, node.nodeKey]));
        const nodes: Node[] = parsed.nodes.map(node => ({
          id: ids.get(node.id)!, revisionId: contentId, nodeKey: existingKeys.get(node.nodeId) ?? assignments?.get(node.nodeId)?.entityId ?? node.nodeId, kind: node.nodeKind,
          anchor: node.nodeId, path: node.path, level: node.level,
          parentId: node.parentNodeId ? ids.get(node.parentNodeId) ?? null : null,
          siblingOrder: node.siblingOrder, ...importText(node.content ?? '', anchors),
          sourceNodeId: null, sourceRevisionId: null, translationMethod: null, reviewStatus: null,
        }));
        if (existing) {
          const reparsed = { ...existing, nodes };
          if (!sameRevision(existing, reparsed)) await tx.reparseRevision(reparsed);
          await tx.updateRevisionMeta(contentId, calculateStatistics(nodes, 'magic-cr', existing.meta));
          if (existingRelease && input.files != null) {
            // Reimport may add downloads without changing the retained source revision.
            // Preserve descriptors for formats no longer present in the local archive.
            const files = new Map(existingRelease.files.map(file => [`${file.language}:${file.format}:${file.translationId ?? ''}`, file]));
            for (const value of input.files) {
              const file = sourceFile.parse(value);
              const key = `${file.language}:${file.format}:${file.translationId ?? ''}`;
              files.set(key, { ...files.get(key), ...file });
            }
            await tx.putRelease({ ...existingRelease, files: [...files.values()] });
          }
          return { documentId: 'magic-cr', revisionId: contentId, releaseId, versionTag, effectiveDate, totalNodes: nodes.length };
        }
        await tx.putRevision({
          id: contentId, documentId: 'magic-cr', translationId: null, sourceRevisionId: null,
          title: 'Comprehensive Rules', language: 'en', createdAt: at, deletedAt: null, nodes,
          meta: calculateStatistics(nodes, 'magic-cr'),
        });
        await tx.putRelease({
          id: releaseId, documentId: 'magic-cr', versionTag, sourceRevisionId: contentId,
          publishedAt: effectiveDate ? new Date(`${effectiveDate}T00:00:00Z`) : at,
          effectiveDate, files: (input.files ?? []).map(file => sourceFile.parse(file)), deletedAt: null,
        });
        return { documentId: 'magic-cr', revisionId: contentId, releaseId, versionTag, effectiveDate, totalNodes: nodes.length };
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
    serial: /^\d+(?:\.\d+[a-z]*)?$/.test(node.anchor ?? '') ? `${node.anchor}${/[a-z]$/.test(node.anchor!) ? '' : '.'}` : null,
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
