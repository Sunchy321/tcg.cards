import { randomUUID } from 'node:crypto';

import { documentSettings, sourceFile } from '@tcg-cards/model/magic/schema/document-content';
import type { DocumentSettings, TextMarker, SourceFile } from '@tcg-cards/model/magic/schema/document-content';
import type { NodeKind } from '@tcg-cards/model/magic/schema/document';

import { validateMarkers } from './text';
import type { DocumentContext } from './service';
import type { Document, DocumentStore, Node, Revision } from './store';

/** Accepts readable node text and semantic annotations at the saving boundary. */
export interface NodeInput {
  nodeKey: string;
  rawText: string;
  kind?: NodeKind;
  parentKey?: string | null;
  anchor?: string;
  markers?: TextMarker[];
}

/** Requires user ownership before any remote authoring operation. */
export async function requireOwner(store: DocumentStore, context: DocumentContext, documentId: string): Promise<Document> {
  const document = await store.document(documentId);
  if (!document || document.deletedAt || context.track !== 'remote' || !context.actorId || document.origin !== 'user' || document.authorId !== context.actorId) {
    throw new Error('Not allowed');
  }
  return document;
}

/** Constructs independent saved nodes while enforcing valid hierarchy and text ranges. */
export function saveNodes(revisionId: string, inputs: NodeInput[]): Node[] {
  const keys = new Set(inputs.map(node => node.nodeKey));
  if (keys.size !== inputs.length || inputs.some(node => !node.nodeKey.trim())) throw new Error('Duplicate or empty node key');
  const byKey = new Map(inputs.map(node => [node.nodeKey, node]));
  /** Resolves ancestor depth and rejects cycles before any content is inserted. */
  function ancestry(key: string, seen = new Set<string>()): string[] {
    if (seen.has(key)) throw new Error('Node parent cycle');
    seen.add(key);
    const node = byKey.get(key);
    if (!node) throw new Error('Node parent missing');
    return node.parentKey ? [...ancestry(node.parentKey, seen), key] : [key];
  }
  return inputs.map((node, index) => {
    const markers = validateMarkers(node.rawText, node.markers ?? []);
    const ancestors = ancestry(node.nodeKey);
    return {
      id: `${revisionId}/${node.nodeKey}`, revisionId, nodeKey: node.nodeKey,
      kind: node.kind ?? 'content', anchor: node.anchor ?? node.nodeKey,
      path: ancestors.map(key => String(inputs.findIndex(input => input.nodeKey === key)).padStart(8, '0')).join('/'),
      level: ancestors.length - 1, parentId: node.parentKey ? `${revisionId}/${node.parentKey}` : null,
      siblingOrder: index, rawText: node.rawText, markers,
      sourceNodeId: null, sourceRevisionId: null, translationMethod: null, reviewStatus: null,
    };
  });
}

/** Exposes explicit save, release, restore, and history cleanup for user documents. */
export function createAuthoringOperations(store: DocumentStore, context: DocumentContext) {
  return {
    async create(input: { slug: string; title: string; language: string; visibility?: Document['visibility']; settings?: Partial<DocumentSettings> }) {
      if (context.track !== 'remote' || !context.actorId) throw new Error('Not allowed');
      if (!input.slug.trim() || !input.title.trim() || !input.language.trim()) throw new Error('Document identity is incomplete');
      const id = randomUUID();
      return store.transaction(id, async tx => {
        if ((await tx.documents()).some(row => row.slug === input.slug)) throw new Error('Document slug already exists');
        const at = new Date();
        const document: Document = {
          id, slug: input.slug, title: input.title, sourceLanguage: input.language,
          origin: 'user', staticKey: null, authorId: context.actorId, visibility: input.visibility ?? 'private',
          settings: documentSettings.parse(input.settings ?? {}), createdAt: at, updatedAt: at, deletedAt: null,
        };
        await tx.putDocument(document);
        return document;
      });
    },
    async save(input: { documentId: string; title: string; nodes: NodeInput[] }) {
      return store.transaction(input.documentId, async tx => {
        const document = await requireOwner(tx, context, input.documentId);
        if (!input.title.trim()) throw new Error('Document title is required');
        const id = randomUUID();
        const revision: Revision = {
          id, documentId: document.id, translationId: null, sourceRevisionId: null,
          title: input.title, language: document.sourceLanguage, createdAt: new Date(), deletedAt: null,
          nodes: saveNodes(id, input.nodes),
        };
        await tx.putRevision(revision);
        await tx.putDocument({ ...document, updatedAt: revision.createdAt });
        return revision;
      });
    },
    async publish(input: { documentId: string; revisionId: string; versionTag: string; effectiveDate?: string; files?: SourceFile[] }) {
      return store.transaction(input.documentId, async tx => {
        await requireOwner(tx, context, input.documentId);
        const revision = await tx.revision(input.revisionId);
        if (!revision || revision.documentId !== input.documentId || revision.translationId || revision.deletedAt) throw new Error('Invalid release revision');
        if (!input.versionTag.trim()) throw new Error('Release version is required');
        const existing = (await tx.releases(input.documentId)).find(row => row.versionTag === input.versionTag);
        if (existing) {
          if (existing.sourceRevisionId !== revision.id) throw new Error('Release already exists');
          return existing;
        }
        const release = {
          id: `${input.documentId}:${input.versionTag}`, documentId: input.documentId,
          versionTag: input.versionTag, sourceRevisionId: revision.id, publishedAt: new Date(),
          effectiveDate: input.effectiveDate ?? null, files: (input.files ?? []).map(file => sourceFile.parse(file)), deletedAt: null,
        };
        await tx.putRelease(release);
        return release;
      });
    },
    async revisions(documentId: string) {
      await readableHistory(store, context, documentId);
      return (await store.revisions(documentId)).filter(row => !row.deletedAt);
    },
    async revision(input: { documentId: string; revisionId: string }) {
      const document = await readableHistory(store, context, input.documentId);
      const revision = await store.revision(input.revisionId);
      const owner = context.actorId != null && document.authorId === context.actorId;
      if (!revision || revision.documentId !== input.documentId || (revision.deletedAt && !owner && context.track !== 'local')) throw new Error('Revision not found');
      return revision;
    },
    async restore(input: { documentId: string; revisionId: string }) {
      const revision = await this.revision(input);
      if (revision.translationId) throw new Error('Use translation operations to restore a translation');
      const keys = new Map(revision.nodes.map(node => [node.id, node.nodeKey]));
      return this.save({ documentId: input.documentId, title: revision.title, nodes: revision.nodes.map(node => ({
        nodeKey: node.nodeKey, rawText: node.rawText, markers: node.markers, kind: node.kind,
        anchor: node.anchor ?? undefined, parentKey: node.parentId ? keys.get(node.parentId) : null,
      })) });
    },
    async clearHistory(input: { documentId: string; revisionIds: string[] }) {
      return store.transaction(input.documentId, async tx => {
        await requireOwner(tx, context, input.documentId);
        for (const id of input.revisionIds) {
          const revision = await tx.revision(id);
          if (!revision || revision.documentId !== input.documentId) throw new Error('Revision not found');
          // Content survives history cleanup because releases and translations can still reference it.
          await tx.hideRevision(id, new Date());
        }
      });
    },
  };
}

/** Applies the same visibility rule to saved-history listings and their content. */
async function readableHistory(store: DocumentStore, context: DocumentContext, documentId: string): Promise<Document> {
  const document = await store.document(documentId);
  if (!document || document.deletedAt) throw new Error('Document not found');
  const owner = context.actorId != null && document.authorId === context.actorId;
  if (context.track !== 'local' && !owner && (!document.settings.historyPublic || document.visibility !== 'public')) throw new Error('Not allowed');
  return document;
}
