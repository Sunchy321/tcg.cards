import { diffWordsWithSpace } from 'diff';

import type {
  DocumentItemHistoryCell, DocumentItemHistoryDiffSpan, DocumentItemHistoryEvent, DocumentItemHistoryPage, DocumentItemHistoryRow,
} from '@tcg-cards/model/magic/schema/document-page';
import type { DocumentContext } from './service';
import type { Document, DocumentStore, Node, Release } from './store';
import { displayedNodes } from './comparison';
import { loadItemLineage } from './item-history-lineage';
import { formalReleases } from './adjacency';

/** Keeps game symbols and rule references atomic while comparing surrounding text. */
function encode(text: string, map: Map<string, string>): string {
  return text.replace(/(\{[^}]+\}|\d{3}\.\d+[a-z]*(?![a-z0-9]))/g, value => {
    if (!map.has(value)) map.set(value, String.fromCodePoint(0xF0000 + map.size));
    return map.get(value)!;
  });
}

/** Restore atomic tokens after word comparison. */
function decode(text: string, map: Map<string, string>): string {
  return [...text].map(char => {
    const code = char.codePointAt(0)!;
    return code >= 0xF0000 ? [...map.entries()].find(([, token]) => token.codePointAt(0) === code)?.[0] ?? char : char;
  }).join('');
}

/** Coalesces word diffs into runs that carry the removed and added text of one edit. */
function pairedDiff(before: string, after: string): (string | { removed: string, added: string })[] {
  const map = new Map<string, string>();
  const runs: (string | { removed: string, added: string })[] = [];
  for (const change of diffWordsWithSpace(encode(before, map), encode(after, map))) {
    const last = runs.at(-1);
    if (change.added) {
      if (last == null || typeof last === 'string') runs.push({ removed: '', added: change.value });
      else last.added += change.value;
    } else if (change.removed) {
      if (last == null || typeof last === 'string') runs.push({ removed: change.value, added: '' });
      else last.removed += change.value;
    } else if (last == null || typeof last === 'string') {
      runs.push(change.value);
    } else if (change.value === ' ') {
      last.removed += change.value;
      last.added += change.value;
    } else {
      runs.push(change.value);
    }
  }
  return runs.map(run => typeof run === 'string' ? decode(run, map) : { removed: decode(run.removed, map), added: decode(run.added, map) });
}

/** The text of a run as it appears in the middle version of a three-way comparison. */
function middleSide(run: string | { removed: string, added: string }, side: 'before' | 'after'): string {
  if (typeof run === 'string') return run;
  return side === 'before' ? run.added : run.removed;
}

/** Consumes one run's middle-side text, keeping the untouched opposite side. */
function consumeRun(run: string | { removed: string, added: string }, side: 'before' | 'after', length: number) {
  if (typeof run === 'string') return run.slice(length);
  return side === 'before' ? { removed: run.removed, added: run.added.slice(length) } : { removed: run.removed.slice(length), added: run.added };
}

/** Highlights one period against the neighbouring periods of the same language. */
export function threeWayTextDiff(previous: string | null, current: string, next: string | null): DocumentItemHistoryDiffSpan[] {
  const before = pairedDiff(previous ?? current, current);
  const after = pairedDiff(current, next ?? current);
  const spans: DocumentItemHistoryDiffSpan[] = [];
  const push = (type: DocumentItemHistoryDiffSpan['type'], value: string) => {
    if (value === '') return;
    const last = spans.at(-1);
    if (last?.type === type) last.value += value;
    else spans.push({ type, value });
  };
  let left = 0;
  let right = 0;
  while (left < before.length && right < after.length) {
    const beforeRun = before[left]!;
    const afterRun = after[right]!;
    const beforeText = middleSide(beforeRun, 'before');
    const afterText = middleSide(afterRun, 'after');
    // Both run lists reconstruct the same middle text, so their fronts must agree.
    const length = Math.min(beforeText.length, afterText.length);
    if (beforeText.slice(0, length) !== afterText.slice(0, length)) throw new Error('Diff mismatch');
    push(typeof beforeRun === 'string'
      ? (typeof afterRun === 'string' ? 'common' : 'remove')
      : typeof afterRun === 'string' ? 'add' : 'dual', beforeText.slice(0, length));
    before[left] = consumeRun(beforeRun, 'before', length);
    after[right] = consumeRun(afterRun, 'after', length);
    if (beforeText.length === length) left += 1;
    if (afterText.length === length) right += 1;
  }
  return spans;
}

/** Formats an anchor for display while keeping the reader's address form separately. */
function displaySerial(anchor: string | null): string | null {
  if (anchor == null || !/^\d+(?:\.\d+[a-z]*)?$/.test(anchor)) return null;
  return /^\d+(?:\.\d+[a-z]*)?$/.test(anchor) && !/[a-z]$/.test(anchor) ? `${anchor}.` : anchor;
}

/** Date of record for a formal edition. */
function dateOf(release: Release): string {
  return release.effectiveDate ?? release.publishedAt.toISOString().slice(0, 10);
}

/** Applies the entry-history publication gate before any formal content is read. */
function assertHistoryReadable(document: Document | undefined, context: DocumentContext): asserts document is Document {
  if (document == null || document.deletedAt != null
    || (document.visibility === 'private' && document.authorId !== context.actorId)) throw new Error('Document not found');
  const owner = context.actorId != null && document.authorId === context.actorId;
  if (context.track !== 'local' && !owner && (!document.settings.historyPublic || document.visibility !== 'public')) throw new Error('Document not found');
}

/** One displayed entry at an exact formal edition. */
interface HistoryState {
  index:      number;
  node:       Node;
  text:       string;
  serial:     string | null;
  lang:       string;
  isFallback: boolean;
}

/** Checks display continuity without hiding number or fallback changes. */
function sameStates(left: HistoryState[], right: HistoryState[]) {
  return left.length === right.length && left.every((state, index) => {
    const other = right[index]!;
    return state.node.nodeKey === other.node.nodeKey && state.node.anchor === other.node.anchor && state.text === other.text && state.serial === other.serial
      && state.lang === other.lang && state.isFallback === other.isFallback;
  });
}

/** Read prepared source lineage through the existing entry-history presentation contract. */
export function createItemHistoryOperations(store: DocumentStore, context: DocumentContext) {
  return {
    /** Present reachable formal content without running the source matcher. */
    async itemHistory(input: { slug: string, itemId: string, locale: string, versionTag?: string }): Promise<DocumentItemHistoryPage> {
      const document = (await store.documents()).find(row => row.slug === input.slug);
      assertHistoryReadable(document, context);
      return store.transaction(document.id, async store => {
        assertHistoryReadable(await store.document(document.id), context);
        const releases = formalReleases(await store.releases(document.id));
        const { editions, members, events, resolvedItemId, nodeIds } = await loadItemLineage(store, releases, input.itemId, input.versionTag);
        const views = new Map<number, Promise<Map<string, HistoryState>>>();
        /** Resolves a translation at the same edition as its source snapshot. */
        async function stateAt(index: number, node: Node): Promise<HistoryState> {
          const edition = editions[index]!;
          if (!views.has(index)) {
            const needed = new Set(edition.revision.nodes.filter(row => members.has(row.nodeKey)).map(row => row.id));
            for (const event of events) {
              if (event.index === index) for (const row of event.to) needed.add(row.id);
              if (event.index === index + 1) for (const row of event.from) needed.add(row.id);
            }
            views.set(index, displayedNodes(store, edition.release, edition.revision, input.locale).then(displayed => {
              // Retain only the visible lineage, rather than a second copy of
              // every rule in every edition for the lifetime of the request.
              const selected = new Map<string, HistoryState>();
              for (const source of edition.revision.nodes) {
                if (!needed.has(source.id)) continue;
                const view = displayed.get(source.id)!;
                selected.set(source.id, { index, node: source, text: view.rawText, serial: displaySerial(source.anchor), lang: view.localeState.locale, isFallback: view.localeState.isFallback });
              }
              return selected;
            }));
          }
          return (await views.get(index)!).get(node.id)!;
        }
        const states: HistoryState[][] = [];
        for (let index = 0; index < editions.length; index++) {
          states.push(await Promise.all(editions[index]!.revision.nodes.filter(node => members.has(node.nodeKey)).map(node => stateAt(index, node))));
        }
        // An entry born by merging still needs the preceding source snapshot row,
        // even when none of those sources belongs to its expanded split lineage.
        for (const event of events.filter(event => event.kind === 'merged')) {
          const before = states[event.index - 1]!;
          for (const node of event.from) {
            if (!before.some(state => state.node.nodeKey === node.nodeKey)) before.push(await stateAt(event.index - 1, node));
          }
        }
        /** Uses actual adjacent content, including shared split/merge participants, without cross-language diffing. */
        async function adjacentText(state: HistoryState, direction: -1 | 1): Promise<string | null> {
          const index = state.index + direction;
          if (index < 0 || index >= editions.length) return null;
          const neighbour = editions[index]!.nodes.get(state.node.nodeKey);
          if (neighbour && members.has(state.node.nodeKey)) {
            const view = await stateAt(index, neighbour);
            return view.lang === state.lang ? view.text : null;
          }
          const boundary = events.find(event => event.index === (direction === -1 ? state.index : index)
            && (direction === -1 ? event.to : event.from).some(node => node.id === state.node.id));
          if (!boundary) return null;
          const related = await Promise.all((direction === -1 ? boundary.from : boundary.to).map(node => stateAt(index, node)));
          return related.every(view => view.lang === state.lang) ? related.map(view => view.text).join('\n') : null;
        }
        const periods: { from: number, to: number }[] = [];
        for (let index = 0; index < editions.length; index++) {
          if (states[index]!.length === 0) continue;
          const previous = periods.at(-1);
          if (previous && previous.to === index - 1 && !events.some(event => event.index === index)
            && sameStates(states[previous.to]!, states[index]!)) previous.to = index;
          else periods.push({ from: index, to: index });
        }
        /** Keeps only public official numbers in relation labels. */
        function party(node: Node) {
          return { itemId: node.nodeKey, serial: displaySerial(node.anchor) };
        }
        const boundaries = new Map<number, DocumentItemHistoryEvent[]>();
        for (const event of events) {
          const list = boundaries.get(event.index) ?? [];
          list.push({ kind:        event.kind, date:        dateOf(releases[event.index]!), from:        event.from.map(party), to:          event.to.map(party),
            versionFrom: releases[event.index - 1]!.versionTag, versionTo:   releases[event.index]!.versionTag });
          boundaries.set(event.index, list);
        }
        for (let index = 1; index < states.length; index++) {
          const removed = states[index - 1]!.filter(state => !editions[index]!.nodes.has(state.node.nodeKey)
            && !events.some(event => event.index === index && event.from.some(node => node.id === state.node.id)));
          if (removed.length) boundaries.set(index, [...boundaries.get(index) ?? [], {
            kind: 'removed', date: dateOf(releases[index]!), from: removed.map(state => party(state.node)), to: [],
          }]);
        }
        const rows: DocumentItemHistoryRow[] = [];
        for (let index = 0; index < editions.length; index++) {
          for (const event of boundaries.get(index) ?? []) rows.push({ kind: 'event', event });
          const period = periods.find(row => row.from === index);
          if (!period) continue;
          const cells: DocumentItemHistoryCell[] = [];
          const displayed = [...states[period.to]!];
          const merging = events.filter(event => event.kind === 'merged' && event.index === period.to + 1);
          for (const event of merging) {
            for (const node of event.from) {
              if (!displayed.some(state => state.node.nodeKey === node.nodeKey)) displayed.push(await stateAt(period.to, node));
            }
          }
          for (const state of displayed) {
            const snapshot = !members.has(state.node.nodeKey);
            const firstState = snapshot ? state : states[period.from]!.find(row => row.node.nodeKey === state.node.nodeKey)!;
            const previous = period.from > 0 ? states[period.from - 1]!.find(row => row.node.nodeKey === state.node.nodeKey) : undefined;
            const birth = events.find(event => event.index === period.from && event.to.some(node => node.id === firstState.node.id));
            const mergesNext = merging.some(event => event.from.some(node => node.id === state.node.id));
            cells.push({
              itemId:      state.node.nodeKey, nodeId:      nodeIds.get(state.node.id), serial:      state.serial,
              renamedFrom: previous && previous.serial !== state.serial ? previous.serial : null,
              lang:        state.lang, isFallback:  state.isFallback, text:        state.text,
              diff:        threeWayTextDiff(snapshot ? null : await adjacentText(firstState, -1), state.text, await adjacentText(state, 1)),
              changed:     previous == null || previous.text !== state.text,
              state:       mergesNext ? 'merged' : birth?.kind === 'split' ? 'split' : birth ? null : !previous && period.from > 0 ? 'added' : null,
              ...(snapshot ? { isSnapshot: true } : {}),
            });
          }
          rows.push({ kind:        'period', dateFrom:    dateOf(releases[period.from]!),
            dateTo:      period.to === releases.length - 1 ? null : dateOf(releases[period.to]!),
            versionFrom: releases[period.from]!.versionTag, versionTo:   releases[period.to]!.versionTag, cells });
        }
        const queried = states.flat().filter(state => state.node.nodeKey === resolvedItemId);
        const last = queried.at(-1)!;
        const firstPeriod = periods[0]!;
        const lastPeriod = periods.at(-1)!;
        return {
          document: { id: document.id, slug: document.slug, name: document.title, origin: document.origin, settings: document.settings },
          entry:    { itemId:       resolvedItemId, serial:       last.serial, excerpt:      last.text, versionTag:   releases[last.index]!.versionTag,
            firstDate:    dateOf(releases[firstPeriod.from]!), lastDate:     lastPeriod.to === releases.length - 1 ? null : dateOf(releases[lastPeriod.to]!),
            lineageCount: members.size, periodCount:  periods.length },
          rows,
        };
      });
    },
  };
}
