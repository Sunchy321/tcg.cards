import type { DocumentDiffPage, DocumentDiffSection, DocumentEntityHistoryPage, DocumentSectionLocaleState, VersionSummary } from '@tcg-cards/model/magic/schema/document-page';
import type { ParsedDocumentNode } from './parser';
import type { DocumentContext } from './service';
import type { Document, DocumentStore, Node, NodeRelation, Release, Revision } from './store';
import { classifyLinkedNodes, suppressInsertedNumbering, type ChangeRecord, type EntityAssignment, type MatchResult } from './matcher';
import { orderedNodes } from './nodes';
import { textDiff } from './diff-text';
import { createReferenceComparison } from './references';
import { formalReleases, preparedAdjacencies } from './adjacency';
import { assertCompleteRelationGroups, replayComparisonPath } from './comparison-replay';
export { textDiff } from './diff-text';

/** Compare formal editions without depending on import state or exposing drafts. */
export function createComparisonOperations(store: DocumentStore, context: DocumentContext) {
  return {
    async compare(input: { slug: string, fromVersionTag: string, toVersionTag: string, locale?: string }): Promise<DocumentDiffPage> {
      const document = (await store.documents()).find(row => row.slug === input.slug);
      assertReadable(document, context);
      if (!document.settings.compare) throw new Error('Document comparison is disabled');
      const releases = formalReleases(await store.releases(document.id));
      const fromRelease = releases.find(row => row.versionTag === input.fromVersionTag);
      const toRelease = releases.find(row => row.versionTag === input.toVersionTag);
      if (fromRelease == null || toRelease == null) throw new Error('Release not found');
      const fromIndex = releases.findIndex(row => row.id === fromRelease.id);
      const toIndex = releases.findIndex(row => row.id === toRelease.id);
      const firstIndex = Math.min(fromIndex, toIndex);
      const lastIndex = Math.max(fromIndex, toIndex);
      const path = releases.slice(firstIndex, lastIndex + 1);
      const { comparisons } = fromIndex === toIndex ? { comparisons: [] } : await preparedAdjacencies(store, path, releases);
      const from = await loadRevision(store, fromRelease);
      const to = fromRelease.id === toRelease.id ? from : await loadRevision(store, toRelease);
      const fromText = await displayedNodes(store, fromRelease, from, input.locale);
      const toText = await displayedNodes(store, toRelease, to, input.locale);
      const chronologicalFrom = fromIndex <= toIndex ? from : to;
      const chronologicalTo = fromIndex <= toIndex ? to : from;
      const chronologicalGroups = comparisons.length === 0
        ? []
        : await replayComparisonPath(
          store, comparisons.map(row => row.id), chronologicalFrom.nodes, chronologicalTo.nodes,
        );
      const endpointGroups = fromIndex <= toIndex
        ? chronologicalGroups
        : chronologicalGroups.map(group => ({ from: group.to, to: group.from }));
      const matched = createEndpointMatch(endpointGroups, from, to);
      const changes = [...matched.changes];
      const affected = new Set(changes.flatMap(change => relationNodes(change, 'to', toText).map(node => node.id)));
      const previousByKey = new Map(from.nodes.map(node => [node.nodeKey, node]));
      for (const node of to.nodes) {
        if (affected.has(node.id)) continue;
        const assignment = matched.entityAssignments.get(node.anchor ?? node.nodeKey);
        const previous = assignment?.isNew === false ? previousByKey.get(assignment.entityId) : undefined;
        if (previous == null || fromText.get(previous.id)?.rawText === toText.get(node.id)?.rawText) continue;
        changes.push({ type:            'modified', entityId:        previous.nodeKey, fromNodeRefId:   previous.id,
          toNodeRefId:     node.id, confidenceScore: 1, details:         {} });
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
        return current.length > 0
          ? Math.min(...current)
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
          kind:             'change', type:             referenceOnly && change.type === 'renamed_modified' ? 'renamed' : change.type, from:             oldSections[0] ?? null, to:               newSections[0] ?? null,
          fromNodes:        oldSections, toNodes:          newSections,
          textDiff:         reference?.textDiff ?? textDiff(oldNodes.map(node => node.rawText).join('\n'), newNodes.map(node => node.rawText).join('\n')),
          referenceOnly, referenceUpdates: reference?.referenceUpdates ?? [],
          translationOnly:  oldNodes.length === 1 && newNodes.length === 1
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
    /** Present one persisted identity without connecting split or merge targets to its past. */
    async nodeHistory(input: { documentId: string, nodeKey: string }): Promise<DocumentEntityHistoryPage> {
      const document = await store.document(input.documentId);
      assertReadable(document, context);
      const releases = formalReleases(await store.releases(document.id));
      const { comparisons } = await preparedAdjacencies(store, releases);
      const revisionIds = releases.map(row => row.sourceRevisionId);
      const candidates = await store.selectNodes({ revisionIds, itemId: input.nodeKey });
      if (candidates.length === 0) throw new Error('Node not found in published content');
      const comparisonIds = comparisons.map(row => row.id);
      const seedRelations = comparisonIds.length === 0
        ? []
        : await store.nodeRelations({
          comparisonIds, nodeIds: candidates.map(node => node.id),
        });
      if (comparisonIds.length > 0 && candidates.some(node => !seedRelations.some(row => row.nodeId === node.id))) {
        throw new Error('Document relations are incomplete');
      }
      const identities = new Set(seedRelations.map(row => row.identity));
      if (comparisonIds.length === 0) {
        for (const node of candidates) identities.add(node.nodeKey);
      } else if (identities.size === 0) {
        throw new Error('Document relations are incomplete');
      }
      if (identities.size > 1) throw new Error('Node identity is ambiguous across published content');
      const identity = [...identities][0]!;
      const relationRows = comparisonIds.length === 0 ? [] : await store.nodeRelations({ comparisonIds, identities: [identity] });
      const groups = [...new Map(relationRows.map(row => [JSON.stringify([row.comparisonId, row.groupId]), {
        comparisonId: row.comparisonId, groupId: row.groupId,
      }])).values()];
      if (groups.length > 0) assertCompleteRelationGroups(await store.nodeRelations({ comparisonIds, groups }));
      const nodeIdsByRevision = new Map<string, Set<string>>();
      const incomingByRevision = new Map<string, typeof relationRows>();
      const revisionByComparison = new Map(comparisons.map(row => [row.id, { from: row.fromRevisionId, to: row.toRevisionId }]));
      for (const row of relationRows) {
        const boundary = revisionByComparison.get(row.comparisonId);
        const revisionId = boundary?.[row.side];
        if (revisionId == null) throw new Error('Document relations are incomplete');
        const nodeIds = nodeIdsByRevision.get(revisionId) ?? new Set<string>();
        nodeIds.add(row.nodeId);
        nodeIdsByRevision.set(revisionId, nodeIds);
        const targetRevisionId = boundary?.to;
        if (targetRevisionId != null) {
          const incoming = incomingByRevision.get(targetRevisionId) ?? [];
          incoming.push(row);
          incomingByRevision.set(targetRevisionId, incoming);
        }
      }
      if (comparisonIds.length > 0 && relationRows.length === 0) throw new Error('Document relations are incomplete');
      const selectedIds = [...new Set([...nodeIdsByRevision.values()].flatMap(ids => [...ids]))];
      const selectedNodes = await store.selectNodes({ revisionIds, ids: selectedIds });
      const nodesById = new Map(selectedNodes.map(node => [node.id, node]));
      if (selectedIds.some(id => !nodesById.has(id))) throw new Error('Document relations are incomplete');
      const identitiesByRevision = new Map<string, Node>();
      for (const release of releases) {
        const rows = nodeIdsByRevision.get(release.sourceRevisionId) ?? new Set<string>();
        if (rows.size > 1) throw new Error('Document relations are ambiguous');
        const nodeId = [...rows][0];
        if (nodeId != null) identitiesByRevision.set(release.sourceRevisionId, nodesById.get(nodeId)!);
      }
      for (const [index, release] of releases.entries()) {
        const node = identitiesByRevision.get(release.sourceRevisionId);
        if (node == null) continue;
        const incoming = comparisons[index - 1];
        const outgoing = comparisons[index];
        if (incoming && !relationRows.some(row => row.comparisonId === incoming.id && row.side === 'to' && row.nodeId === node.id)) {
          throw new Error('Document relations are incomplete');
        }
        if (outgoing && !relationRows.some(row => row.comparisonId === outgoing.id && row.side === 'from' && row.nodeId === node.id)) {
          throw new Error('Document relations are incomplete');
        }
      }
      if (comparisonIds.length === 0 && candidates.length === 1) identitiesByRevision.set(candidates[0]!.revisionId, candidates[0]!);
      const originIndex = releases.findIndex(release => identitiesByRevision.has(release.sourceRevisionId));
      if (originIndex < 0) throw new Error('Node not found in published content');
      const timeline: DocumentEntityHistoryPage['timeline'] = [];
      const originNode = identitiesByRevision.get(releases[originIndex]!.sourceRevisionId)!;
      const originNodeId = originNode.anchor ?? originNode.nodeKey;
      const originVersionTag = releases[originIndex]!.versionTag;
      let currentNodeId: string | null = null;
      let currentVersionTag: string | null = null;
      for (let index = originIndex; index < releases.length; index++) {
        const release = releases[index]!;
        const node = identitiesByRevision.get(release.sourceRevisionId);
        const change = (incomingByRevision.get(release.sourceRevisionId) ?? []).find(row => row.kind !== 'unchanged');
        const state = node != null ? 'present' : change?.kind === 'split' ? 'split' : change?.kind === 'merged' ? 'merged' : 'removed';
        const changeType = change?.kind === 'unchanged' ? undefined : change?.kind;
        timeline.push({ versionId:     release.id, versionTag:    release.versionTag, effectiveDate: version(release).effectiveDate,
          nodeId:        node == null ? null : node.anchor ?? node.nodeKey, title:         node?.rawText ?? null, content:       node?.rawText ?? null,
          state, change:        changeType == null
            ? null
            : { changeId:    `${release.id}/${input.nodeKey}/${changeType}`, type:        changeType,
              reviewState: 'unreviewed', summary:     changeSummary({ type: changeType }) } });
        currentNodeId = node == null ? null : node.anchor ?? node.nodeKey;
        currentVersionTag = node == null ? null : release.versionTag;
      }
      return { document: { id: document.id, slug: document.slug, name: document.title, origin: document.origin, settings: document.settings },
        entity:   { id: input.nodeKey, originNodeId, originVersionTag, currentNodeId, currentVersionTag, totalRevisions: timeline.length }, timeline };
    },
  };
}

/** Convert replayed endpoint components into the existing change record contract. */
function createEndpointMatch(groups: Awaited<ReturnType<typeof replayComparisonPath>>, from: Revision, to: Revision): MatchResult {
  const fromById = new Map(from.nodes.map(node => [node.id, node]));
  const toById = new Map(to.nodes.map(node => [node.id, node]));
  const entityAssignments = new Map<string, EntityAssignment>();
  const changes: ChangeRecord[] = [];
  const assignedTargets = new Set<string>();

  /** Resolve persisted relation participants to actual endpoint nodes. */
  function nodeFor(row: NodeRelation, nodes: Map<string, Node>): Node {
    const node = nodes.get(row.nodeId);
    if (node == null) throw new Error('Document relations are incomplete');
    return node;
  }

  /** Pair unique endpoint evidence without running the matching algorithm again. */
  function pairUnique(left: NodeRelation[], right: NodeRelation[], key: (row: NodeRelation, side: 'from' | 'to') => string) {
    const leftByKey = new Map<string, NodeRelation[]>();
    const rightByKey = new Map<string, NodeRelation[]>();
    for (const row of left) leftByKey.set(key(row, 'from'), [...leftByKey.get(key(row, 'from')) ?? [], row]);
    for (const row of right) rightByKey.set(key(row, 'to'), [...rightByKey.get(key(row, 'to')) ?? [], row]);
    const pairs: { from: NodeRelation, to: NodeRelation }[] = [];
    const usedLeft = new Set<string>();
    const usedRight = new Set<string>();
    for (const [value, fromRows] of leftByKey) {
      const toRows = rightByKey.get(value);
      if (value === '' || fromRows.length !== 1 || toRows?.length !== 1) continue;
      pairs.push({ from: fromRows[0]!, to: toRows[0]! });
      usedLeft.add(fromRows[0]!.nodeId);
      usedRight.add(toRows[0]!.nodeId);
    }
    return { pairs, left: left.filter(row => !usedLeft.has(row.nodeId)), right: right.filter(row => !usedRight.has(row.nodeId)) };
  }

  /** Register an endpoint pair and classify only its actual source content. */
  function addPair(fromRow: NodeRelation, toRow: NodeRelation) {
    const oldNode = nodeFor(fromRow, fromById);
    const newNode = nodeFor(toRow, toById);
    const targetKey = newNode.anchor ?? newNode.nodeKey;
    const previous = entityAssignments.get(targetKey);
    if (previous != null && previous.entityId !== oldNode.nodeKey) throw new Error('Document relations are ambiguous');
    entityAssignments.set(targetKey, { entityId: oldNode.nodeKey, isNew: false });
    assignedTargets.add(newNode.id);
    if (oldNode.rawText === newNode.rawText && (oldNode.anchor ?? oldNode.nodeKey) === (newNode.anchor ?? newNode.nodeKey)
      && oldNode.path === newNode.path) return;
    const classification = classifyLinkedNodes(oldNode, newNode);
    changes.push({ entityId:        oldNode.nodeKey, fromNodeRefId:   oldNode.id, toNodeRefId:     newNode.id,
      type:            classification.type, confidenceScore: 1, details:         classification.details });
  }

  /** Add an existing multi-section change row for the remaining relation participants. */
  function addGroup(type: ChangeRecord['type'], left: NodeRelation[], right: NodeRelation[]) {
    for (const row of right) {
      if (!assignedTargets.has(row.nodeId)) {
        const node = nodeFor(row, toById);
        entityAssignments.set(node.anchor ?? node.nodeKey, { entityId: row.identity, isNew: true });
      }
    }
    const relations: NonNullable<ChangeRecord['relations']> = [
      ...left.map((row, sortOrder) => ({ side:      'from' as const, entityId:  row.identity, nodeRefId: row.nodeId,
        nodeId:    nodeFor(row, fromById).anchor ?? nodeFor(row, fromById).nodeKey, weight:    null, sortOrder })),
      ...right.map((row, sortOrder) => ({ side:      'to' as const, entityId:  row.identity, nodeRefId: row.nodeId,
        nodeId:    nodeFor(row, toById).anchor ?? nodeFor(row, toById).nodeKey, weight:    null, sortOrder })),
    ];
    changes.push({ entityId:        left[0]?.identity ?? right[0]?.identity ?? null,
      fromNodeRefId:   left[0]?.nodeId ?? null, toNodeRefId:     right[0]?.nodeId ?? null,
      type, confidenceScore: 1, details:         {}, relations });
  }

  for (const group of groups) {
    let left = group.from;
    let right = group.to;
    const paired: { from: NodeRelation, to: NodeRelation }[] = [];
    const byIdentity = pairUnique(left, right, row => row.identity);
    paired.push(...byIdentity.pairs);
    left = byIdentity.left;
    right = byIdentity.right;
    const byAddress = pairUnique(left, right, (row, side) => {
      const node = nodeFor(row, side === 'from' ? fromById : toById);
      return JSON.stringify([node.kind, node.anchor ?? node.nodeKey]);
    });
    paired.push(...byAddress.pairs);
    left = byAddress.left;
    right = byAddress.right;
    const byContent = pairUnique(left, right, (row, side) => {
      const node = nodeFor(row, side === 'from' ? fromById : toById);
      return JSON.stringify([node.kind, node.level, node.rawText]);
    });
    paired.push(...byContent.pairs);
    left = byContent.left;
    right = byContent.right;
    if (left.length === 1 && right.length === 1) {
      paired.push({ from: left[0]!, to: right[0]! });
      left = [];
      right = [];
    }
    for (const pair of paired) addPair(pair.from, pair.to);
    if (left.length === 0 && right.length === 0) continue;
    const type: ChangeRecord['type'] = left.length === 0
      ? 'added'
      : right.length === 0
        ? 'removed'
        : left.length === 1 && right.length > 1
          ? 'split'
          : left.length > 1 && right.length === 1 ? 'merged' : 'modified';
    addGroup(type, left, right);
  }
  for (const node of to.nodes) {
    const key = node.anchor ?? node.nodeKey;
    if (!entityAssignments.has(key)) entityAssignments.set(key, { entityId: node.nodeKey, isNew: true });
  }
  return suppressInsertedNumbering(from, to, { entityAssignments, changes });
}

/** Describe formal changes in reader-facing language. */
function changeSummary(change: { type: Exclude<NodeRelation['kind'], 'unchanged'> }): string {
  return { added:            'Added', removed:          'Removed', modified:         'Text updated', moved:            'Moved to another chapter',
    renamed:          'Number changed', renamed_modified: 'Number and text changed', split:            'Divided into multiple sections', merged:           'Combined into one section' }[change.type];
}

/** Reject inaccessible identities before reading their formal content. */
function assertReadable(document: Document | undefined, context: DocumentContext): asserts document is Document {
  if (document == null || document.deletedAt != null || (document.visibility === 'private' && document.authorId !== context.actorId)) throw new Error('Document not found');
}

/** Resolve retained revision content even after edit-history cleanup. */
export async function loadRevision(store: DocumentStore, release: Release): Promise<Revision> {
  const revision = await store.revision(release.sourceRevisionId);
  if (revision == null || revision.documentId !== release.documentId || revision.translationId != null) throw new Error('Release content missing');
  return { ...revision, nodes: orderedNodes(revision.nodes) };
}

/** Adapt content into the parser-shaped input expected by the pure matcher. */
export function asParsed(revision: Revision): ParsedDocumentNode[] {
  return revision.nodes.map(node => ({ id:           node.id, documentId:   revision.documentId, versionId:    revision.id,
    nodeId:       node.anchor ?? node.nodeKey, nodeKind:     node.kind, path:         node.path, level:        node.level,
    parentNodeId: node.parentId, siblingOrder: node.siblingOrder, content:      node.rawText }));
}

/** Retain each side's actual language alongside source-based structure and identity. */
interface DisplayNode extends Node {
  localeState: DocumentSectionLocaleState;
}

/** Overlay only the selected translation, retaining source structure for missing nodes. */
export async function displayedNodes(store: DocumentStore, release: Release, source: Revision, language?: string): Promise<Map<string, DisplayNode>> {
  const nodes = new Map<string, DisplayNode>(source.nodes.map(node => [node.id, { ...node,
    localeState: { locale: source.language, status: 'source', isFallback: language != null && language !== source.language },
  }]));
  if (language == null || language === source.language) return nodes;
  const translations = await store.translations(source.documentId);
  const translation = translations.find(row => row.language === language);
  const binding = (await store.releaseTranslations(release.id)).find(row => row.translationId === translation?.id);
  const revision = binding == null ? undefined : (await store.revisionHeaders([binding.revisionId]))[0];
  if (revision?.sourceRevisionId !== source.id || revision.documentId !== source.documentId
    || revision.translationId !== translation?.id || revision.language !== language) return nodes;
  const translated = await store.selectNodes({ revisionIds: [revision.id], sourceNodeIds: source.nodes.map(node => node.id) });
  for (const node of translated) {
    const original = node.sourceNodeId == null ? undefined : nodes.get(node.sourceNodeId);
    if (original != null && node.rawText.trim() !== '') nodes.set(original.id, { ...original, rawText:     node.rawText, markers:     node.markers,
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
