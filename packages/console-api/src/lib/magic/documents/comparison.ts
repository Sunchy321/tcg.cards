import type { DocumentDiffPage, DocumentDiffSection, DocumentEntityHistoryPage, DocumentSectionLocaleState, VersionSummary } from '@tcg-cards/model/magic/schema/document-page';
import type { ParsedDocumentNode } from './parser';
import type { DocumentContext } from './service';
import type { Document, DocumentStore, Node, Release, Revision } from './store';
import { matchRevisionNodes, type ChangeRecord } from './matcher';
import { orderedNodes } from './nodes';
import { textDiff } from './diff-text';
import { createReferenceComparison } from './references';
export { textDiff } from './diff-text';

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
      // Correspondence and structural changes always come from the original language.
      const matched = matchRevisionNodes(from, asParsed(to), to.id);
      const changes = [...matched.changes];
      const affected = new Set(changes.flatMap(change => relationNodes(change, 'to', toText).map(node => node.id)));
      const previousByKey = new Map(from.nodes.map(node => [node.nodeKey, node]));
      for (const node of to.nodes) {
        if (affected.has(node.id)) continue;
        const assignment = matched.entityAssignments.get(node.anchor ?? node.nodeKey);
        const previous = assignment?.isNew === false ? previousByKey.get(assignment.entityId) : undefined;
        if (previous == null || fromText.get(previous.id)?.rawText === toText.get(node.id)?.rawText) continue;
        changes.push({ type: 'modified', entityId: previous.nodeKey, fromNodeRefId: previous.id,
          toNodeRefId: node.id, confidenceScore: 1, details: {} });
      }
      // Translation-only changes are discovered after source matching, but their
      // display position follows the same tree order as every other changed node.
      const positions = new Map(to.nodes.map((node, index) => [node.id, index]));
      const destinations = new Map<string, number>();
      for (const node of to.nodes) {
        const assignment = matched.entityAssignments.get(node.anchor ?? node.nodeKey);
        if (assignment?.isNew === false) destinations.set(assignment.entityId, positions.get(node.id)!);
      }
      const oldPositions = new Map<string, number>();
      let following = to.nodes.length;
      for (const node of [...from.nodes].reverse()) {
        const destination = destinations.get(node.nodeKey);
        if (destination != null) following = destination;
        // Removed content remains immediately before its next surviving neighbor.
        oldPositions.set(node.id, destination ?? following - 0.5);
      }
      const previousOrder = new Map(from.nodes.map((node, index) => [node.id, index]));
      /** Position a change at its earliest destination, or its retained source context. */
      function position(change: ChangeRecord) {
        const current = relationNodes(change, 'to', toText).map(node => positions.get(node.id)!);
        return current.length > 0 ? Math.min(...current)
          : Math.min(...relationNodes(change, 'from', fromText).map(node => oldPositions.get(node.id)!));
      }
      changes.sort((left, right) => position(left) - position(right)
        || (previousOrder.get(left.fromNodeRefId ?? '') ?? 0) - (previousOrder.get(right.fromNodeRefId ?? '') ?? 0));
      const fromSource = new Map(from.nodes.map(node => [node.id, node]));
      const toSource = new Map(to.nodes.map(node => [node.id, node]));
      const references = createReferenceComparison(from, to, matched, { from: fromRelease.id, to: toRelease.id });
      const stats = { added: 0, removed: 0, modified: 0, referenceUpdated: 0, moved: 0, renamed: 0, renamedModified: 0, split: 0, merged: 0 };
      const rows: DocumentDiffPage['rows'] = changes.map(change => {
        const oldNodes = relationNodes(change, 'from', fromText);
        const newNodes = relationNodes(change, 'to', toText);
        const reference = oldNodes.length === 1 && newNodes.length === 1 ? references(oldNodes[0]!, newNodes[0]!) : undefined;
        const oldOriginal = oldNodes.length === 1 ? fromSource.get(oldNodes[0]!.id) : undefined;
        const newOriginal = newNodes.length === 1 ? toSource.get(newNodes[0]!.id) : undefined;
        const sourceOnly = oldOriginal != null && newOriginal != null
          && (oldOriginal.rawText === newOriginal.rawText || references(oldOriginal, newOriginal).referenceOnly);
        const referenceOnly = reference?.referenceOnly === true && sourceOnly;
        if (referenceOnly) {
          stats.referenceUpdated++;
          if (change.type === 'renamed_modified') stats.renamed++;
          else if (change.type !== 'modified') stats[change.type]++;
        } else stats[change.type === 'renamed_modified' ? 'renamedModified' : change.type]++;
        const oldSections = oldNodes.map(section);
        const newSections = newNodes.map(section);
        return {
          kind: 'change', type: referenceOnly && change.type === 'renamed_modified' ? 'renamed' : change.type, from: oldSections[0] ?? null, to: newSections[0] ?? null,
          fromNodes: oldSections, toNodes: newSections,
          textDiff: reference?.textDiff ?? textDiff(oldNodes.map(node => node.rawText).join('\n'), newNodes.map(node => node.rawText).join('\n')),
          referenceOnly, referenceUpdates: reference?.referenceUpdates ?? [],
          translationOnly: oldNodes.length === 1 && newNodes.length === 1
            && !oldNodes[0]!.localeState.isFallback && !newNodes[0]!.localeState.isFallback
            && oldNodes[0]!.localeState.status !== 'source' && newNodes[0]!.localeState.status !== 'source'
            && fromSource.get(oldNodes[0]!.id)?.rawText === toSource.get(newNodes[0]!.id)?.rawText
            && oldNodes[0]!.rawText !== newNodes[0]!.rawText,
        };
      });
      const changed = new Set(changes.flatMap(change => relationNodes(change, 'to', toText).map(node => node.id)));
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
  return { ...revision, nodes: orderedNodes(revision.nodes) };
}

/** Adapt content into the parser-shaped input expected by the pure matcher. */
function asParsed(revision: Revision): ParsedDocumentNode[] {
  return revision.nodes.map(node => ({ id: node.id, documentId: revision.documentId, versionId: revision.id,
    nodeId: node.anchor ?? node.nodeKey, nodeKind: node.kind, path: node.path, level: node.level,
    parentNodeId: node.parentId, siblingOrder: node.siblingOrder, content: node.rawText }));
}

/** Retain each side's actual language alongside source-based structure and identity. */
interface DisplayNode extends Node {
  localeState: DocumentSectionLocaleState;
}

/** Overlay only the selected translation, retaining source structure for missing nodes. */
async function displayedNodes(store: DocumentStore, release: Release, source: Revision, language?: string): Promise<Map<string, DisplayNode>> {
  const nodes = new Map<string, DisplayNode>(source.nodes.map(node => [node.id, { ...node,
    localeState: { locale: source.language, status: 'source', isFallback: language != null && language !== source.language },
  }]));
  if (language == null || language === source.language) return nodes;
  const translations = await store.translations(source.documentId);
  const translation = translations.find(row => row.language === language);
  const binding = (await store.releaseTranslations(release.id)).find(row => row.translationId === translation?.id);
  const revision = binding == null ? undefined : await store.revision(binding.revisionId);
  if (revision?.sourceRevisionId !== source.id || revision.documentId !== source.documentId
    || revision.translationId !== translation?.id || revision.language !== language) return nodes;
  for (const node of revision.nodes) {
    const original = node.sourceNodeId == null ? undefined : nodes.get(node.sourceNodeId);
    if (original != null && node.rawText.trim() !== '') nodes.set(original.id, { ...original, rawText: node.rawText, markers: node.markers,
      localeState: { locale: revision.language, status: 'published', isFallback: false },
    });
  }
  return nodes;
}

/** Keep all split or merged participants rather than only the primary node. */
function relationNodes<T extends Node>(change: ChangeRecord, side: 'from' | 'to', nodes: Map<string, T>): T[] {
  const ids = change.relations?.filter(row => row.side === side).map(row => row.nodeRefId).filter((id): id is string => id != null)
    ?? [side === 'from' ? change.fromNodeRefId : change.toNodeRefId].filter((id): id is string => id != null);
  return ids.map(id => nodes.get(id)).filter((node): node is T => node != null);
}

/** Format a section without leaking internal storage identifiers. */
function section(node: DisplayNode): DocumentDiffSection {
  const anchor = node.anchor ?? node.nodeKey;
  return { localeState: node.localeState, nodeId: anchor, kind: node.kind, serial: /^\d+(?:\.\d+[a-z]*)?$/.test(anchor) ? `${anchor}${/[a-z]$/.test(anchor) ? '' : '.'}` : null, text: node.rawText, level: node.level };
}

/** Format a formal edition using stable dates from its release record. */
function version(release: Release): VersionSummary {
  return { id: release.id, versionTag: release.versionTag, effectiveDate: release.effectiveDate ?? release.publishedAt.toISOString().slice(0, 10), publishedAt: release.publishedAt.toISOString().slice(0, 10) };
}
