import type { DocumentChangeTextDiff, DocumentDiffPage, DocumentDiffSection, DocumentEntityHistoryPage, VersionSummary } from '@tcg-cards/model/magic/schema/document-page';
import type { ParsedDocumentNode } from './parser';
import type { DocumentContext } from './service';
import type { Document, DocumentStore, Node, Release, Revision } from './store';
import { matchRevisionNodes, type ChangeRecord } from './matcher';

/** Compare formal editions without depending on import state or exposing drafts. */
export function createComparisonOperations(store: DocumentStore, context: DocumentContext) {
  return {
    async compare(input: { slug: string; fromVersionTag: string; toVersionTag: string; locale?: string }): Promise<DocumentDiffPage> {
      const document = (await store.documents()).find(row => row.slug === input.slug);
      assertReadable(document, context);
      if (!document.settings.compare) throw new Error('Document comparison is disabled');
      const releases = (await store.releases(document.id)).filter(row => row.deletedAt == null);
      const fromRelease = releases.find(row => row.versionTag === input.fromVersionTag);
      const toRelease = releases.find(row => row.versionTag === input.toVersionTag);
      if (fromRelease == null || toRelease == null) throw new Error('Release not found');
      const from = await loadRevision(store, fromRelease);
      const to = await loadRevision(store, toRelease);
      const fromText = await displayedNodes(store, fromRelease, from, input.locale);
      const toText = await displayedNodes(store, toRelease, to, input.locale);
      const matched = matchRevisionNodes({ ...from, nodes: [...fromText.values()] }, asParsed({ ...to, nodes: [...toText.values()] }), to.id);
      const stats = { added: 0, removed: 0, modified: 0, moved: 0, renamed: 0, renamedModified: 0, split: 0, merged: 0 };
      const rows: DocumentDiffPage['rows'] = matched.changes.map(change => {
        stats[change.type === 'renamed_modified' ? 'renamedModified' : change.type]++;
        const oldNodes = relationNodes(change, 'from', fromText);
        const newNodes = relationNodes(change, 'to', toText);
        const oldSections = oldNodes.map(section);
        const newSections = newNodes.map(section);
        return {
          kind: 'change', type: change.type, from: oldSections[0] ?? null, to: newSections[0] ?? null,
          fromNodes: oldSections, toNodes: newSections,
          textDiff: textDiff(oldNodes.map(node => node.rawText).join('\n'), newNodes.map(node => node.rawText).join('\n')),
        };
      });
      const changed = new Set(matched.changes.flatMap(change => relationNodes(change, 'to', toText).map(node => node.id)));
      const omitted = to.nodes.filter(node => !changed.has(node.id)).length;
      if (omitted > 0) rows.push({ kind: 'omitted', count: omitted });
      return { document: { id: document.id, slug: document.slug, name: document.title, origin: document.origin, settings: document.settings }, fromVersion: version(fromRelease), toVersion: version(toRelease), stats, rows };
    },
    async nodeHistory(input: { documentId: string; nodeKey: string }): Promise<DocumentEntityHistoryPage> {
      const document = await store.document(input.documentId);
      assertReadable(document, context);
      const releases = (await store.releases(document.id)).filter(row => row.deletedAt == null)
        .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.id.localeCompare(b.id));
      const timeline: DocumentEntityHistoryPage['timeline'] = [];
      const editions = await historyEditions(store, releases);
      const identities = new Set(editions.flatMap(edition => edition.original.nodes
        .filter(node => node.nodeKey === input.nodeKey)
        .map(node => edition.revision.nodes.find(canonical => canonical.id === node.id)!.nodeKey)));
      if (identities.size === 0) throw new Error('Node not found in published content');
      if (identities.size > 1) throw new Error('Node identity is ambiguous across published content');
      const identity = [...identities][0]!;
      let originNodeId: string | undefined;
      let originVersionTag: string | undefined;
      let currentNodeId: string | null = null;
      let currentVersionTag: string | null = null;
      for (const { release, revision, changes } of editions) {
        const node = revision.nodes.find(row => row.nodeKey === identity);
        const change = changes.find(row => row.entityId === identity || row.relations?.some(relation => relation.entityId === identity));
        if (node != null && originNodeId == null) {
          originNodeId = node.anchor ?? node.nodeKey;
          originVersionTag = release.versionTag;
        }
        if (originNodeId != null) {
          const state = node != null ? 'present' : change?.type === 'split' ? 'split' : change?.type === 'merged' ? 'merged' : 'removed';
          timeline.push({ versionId: release.id, versionTag: release.versionTag, effectiveDate: version(release).effectiveDate,
            nodeId: node == null ? null : node.anchor ?? node.nodeKey, title: node?.rawText ?? null, content: node?.rawText ?? null,
            state, change: change == null ? null : { changeId: `${release.id}/${input.nodeKey}/${change.type}`, type: change.type, reviewState: 'unreviewed', summary: changeSummary(change) } });
          currentNodeId = node == null ? null : node.anchor ?? node.nodeKey;
          currentVersionTag = node == null ? null : release.versionTag;
        }
      }
      if (originNodeId == null || originVersionTag == null) throw new Error('Node not found in published content');
      return { document: { id: document.id, slug: document.slug, name: document.title, origin: document.origin, settings: document.settings },
        entity: { id: input.nodeKey, originNodeId, originVersionTag, currentNodeId, currentVersionTag, totalRevisions: timeline.length }, timeline };
    },
  };
}

/** Track canonical identities separately from immutable import-time assignments. */
interface HistoryEdition {
  release: Release;
  original: Revision;
  revision: Revision;
  changes: ChangeRecord[];
}

/** Rebuild chronological lineage so archived editions may be imported in any order. */
async function historyEditions(store: DocumentStore, releases: Release[]): Promise<HistoryEdition[]> {
  const editions: HistoryEdition[] = [];
  let previous: Revision | null = null;
  for (const release of releases) {
    const original = await loadRevision(store, release);
    const matched = matchRevisionNodes(previous, asParsed(original), original.id);
    const revision: Revision = { ...original, nodes: original.nodes.map(node => {
      const assignment = matched.entityAssignments.get(node.anchor ?? node.nodeKey);
      return { ...node, nodeKey: assignment == null || assignment.isNew ? node.id : assignment.entityId };
    }) };
    const keys = new Map([...(previous?.nodes ?? []), ...revision.nodes].map(node => [node.id, node.nodeKey]));
    const changes = matched.changes.map(change => {
      const primary = change.type === 'split' ? change.fromNodeRefId : change.toNodeRefId ?? change.fromNodeRefId;
      return { ...change, entityId: primary == null ? null : keys.get(primary) ?? null,
        relations: change.relations?.map(relation => ({ ...relation,
          entityId: relation.nodeRefId == null ? null : keys.get(relation.nodeRefId) ?? null,
        })),
      };
    });
    editions.push({ release, original, revision, changes });
    previous = revision;
  }
  return editions;
}

/** Describe formal changes in reader-facing language. */
function changeSummary(change: ChangeRecord): string {
  return { added: 'Added', removed: 'Removed', modified: 'Text updated', moved: 'Moved to another chapter',
    renamed: 'Number changed', renamed_modified: 'Number and text changed', split: 'Divided into multiple sections', merged: 'Combined into one section' }[change.type];
}

/** Reject inaccessible identities before reading their formal content. */
function assertReadable(document: Document | undefined, context: DocumentContext): asserts document is Document {
  if (document == null || document.deletedAt != null || (document.visibility === 'private' && document.authorId !== context.actorId)) throw new Error('Document not found');
}

/** Resolve retained revision content even after edit-history cleanup. */
async function loadRevision(store: DocumentStore, release: Release): Promise<Revision> {
  const revision = await store.revision(release.sourceRevisionId);
  if (revision == null || revision.documentId !== release.documentId || revision.translationId != null) throw new Error('Release content missing');
  return revision;
}

/** Adapt content into the parser-shaped input expected by the pure matcher. */
function asParsed(revision: Revision): ParsedDocumentNode[] {
  return revision.nodes.map(node => ({ id: node.id, documentId: revision.documentId, versionId: revision.id,
    nodeId: node.anchor ?? node.nodeKey, nodeKind: node.kind, path: node.path, level: node.level,
    parentNodeId: node.parentId, siblingOrder: node.siblingOrder, content: node.rawText }));
}

/** Overlay only the selected translation, retaining source structure for missing nodes. */
async function displayedNodes(store: DocumentStore, release: Release, source: Revision, language?: string): Promise<Map<string, Node>> {
  const nodes = new Map(source.nodes.map(node => [node.id, node]));
  if (language == null || language === source.language) return nodes;
  const translations = await store.translations(source.documentId);
  const translation = translations.find(row => row.language === language);
  const binding = (await store.releaseTranslations(release.id)).find(row => row.translationId === translation?.id);
  const revision = binding == null ? undefined : await store.revision(binding.revisionId);
  if (revision?.sourceRevisionId !== source.id) return nodes;
  for (const node of revision.nodes) {
    const original = node.sourceNodeId == null ? undefined : nodes.get(node.sourceNodeId);
    if (original != null) nodes.set(original.id, { ...original, rawText: node.rawText, markers: node.markers });
  }
  return nodes;
}

/** Keep all split or merged participants rather than only the primary node. */
function relationNodes(change: ChangeRecord, side: 'from' | 'to', nodes: Map<string, Node>): Node[] {
  const ids = change.relations?.filter(row => row.side === side).map(row => row.nodeRefId).filter((id): id is string => id != null)
    ?? [side === 'from' ? change.fromNodeRefId : change.toNodeRefId].filter((id): id is string => id != null);
  return ids.map(id => nodes.get(id)).filter((node): node is Node => node != null);
}

/** Format a section without leaking internal storage identifiers. */
function section(node: Node): DocumentDiffSection {
  const anchor = node.anchor ?? node.nodeKey;
  return { nodeId: anchor, kind: node.kind, serial: /^\d+(?:\.\d+[a-z]?)?$/.test(anchor) ? `${anchor}${/[a-z]$/.test(anchor) ? '' : '.'}` : null, text: node.rawText, level: node.level };
}

/** Format a formal edition using stable dates from its release record. */
function version(release: Release): VersionSummary {
  return { id: release.id, versionTag: release.versionTag, effectiveDate: release.effectiveDate ?? release.publishedAt.toISOString().slice(0, 10), publishedAt: release.publishedAt.toISOString().slice(0, 10) };
}

/** Preserve a common prefix and suffix while highlighting the changed middle. */
export function textDiff(before: string, after: string): DocumentChangeTextDiff | null {
  if (before === after) return null;
  const left = Array.from(before);
  const right = Array.from(after);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix++;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - suffix - 1] === right[right.length - suffix - 1]) suffix++;
  const blocks: DocumentChangeTextDiff['blocks'] = [];
  if (prefix > 0) blocks.push({ type: 'common', text: left.slice(0, prefix).join('') });
  if (left.length > prefix + suffix) blocks.push({ type: 'removed', text: left.slice(prefix, left.length - suffix).join('') });
  if (right.length > prefix + suffix) blocks.push({ type: 'added', text: right.slice(prefix, right.length - suffix).join('') });
  if (suffix > 0) blocks.push({ type: 'common', text: left.slice(left.length - suffix).join('') });
  return { mode: 'inline', blocks };
}
