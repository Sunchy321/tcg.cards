import { diffWordsWithSpace } from 'diff';

import type {
  DocumentItemHistoryDiffSpan, DocumentItemHistoryPage, DocumentItemHistoryRow,
} from '@tcg-cards/model/magic/schema/document-page';
import type { DocumentContext } from './service';
import type { Document, DocumentStore, Release } from './store';
import { displayedNodes, loadRevision } from './comparison';

/** Keeps game symbols and rule references atomic while comparing surrounding text. */
function encode(text: string, map: Map<string, string>): string {
  return text.replace(/(\{[^}]+\}|\d{3}\.\d+[a-z]*(?![a-z0-9]))/g, value => {
    if (!map.has(value)) map.set(value, String.fromCodePoint(0xF0000 + map.size));
    return map.get(value)!;
  });
}

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
    push(typeof beforeRun === 'string' ? (typeof afterRun === 'string' ? 'common' : 'remove')
      : typeof afterRun === 'string' ? 'add' : 'dual', beforeText.slice(0, length));
    before[left] = consumeRun(beforeRun, 'before', length);
    after[right] = consumeRun(afterRun, 'after', length);
    if (beforeText.length === length) left += 1;
    if (afterText.length === length) right += 1;
  }
  return spans;
}

/** True when two displays describe the same reading state and share one period. */
function sameState(left: { text: string, serial: string | null, lang: string }, right: { text: string, serial: string | null, lang: string }): boolean {
  return left.text === right.text && left.serial === right.serial && left.lang === right.lang;
}

/** Formats an anchor for display while keeping the reader's address form separately. */
function displaySerial(anchor: string | null): string | null {
  if (anchor == null) return null;
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

/** Rebuilds one entry's formal history as a time-aligned row grid over published editions. */
export function createItemHistoryOperations(store: DocumentStore, context: DocumentContext) {
  return {
    async itemHistory(input: { slug: string; itemId: string; locale: string }): Promise<DocumentItemHistoryPage> {
      const document = (await store.documents()).find(row => row.slug === input.slug);
      assertHistoryReadable(document, context);
      const releases = (await store.releases(document.id)).filter(row => row.deletedAt == null)
        .sort((left, right) => left.versionTag.localeCompare(right.versionTag) || left.id.localeCompare(right.id));
      const latestId = releases.at(-1)?.id;
      interface State { release: Release, text: string, serial: string | null, lang: string, isFallback: boolean }
      const states: State[] = [];
      for (const release of releases) {
        const source = await loadRevision(store, release);
        const node = source.nodes.find(row => row.nodeKey === input.itemId);
        if (node == null) continue;
        const view = (await displayedNodes(store, release, source, input.locale)).get(node.id)!;
        states.push({ release, text: view.rawText, serial: view.anchor, lang: view.localeState.locale, isFallback: view.localeState.isFallback });
      }
      if (states.length === 0 || latestId == null) throw new Error('Item not found in published content');

      const periods: { from: State, to: State }[] = [];
      for (const state of states) {
        const last = periods.at(-1);
        if (last && sameState(last.to, state)) last.to = state;
        else periods.push({ from: state, to: state });
      }
      const first = periods[0]!;
      const last = periods.at(-1)!;
      const alive = last.to.release.id === latestId;
      const party = (state: State) => ({ itemId: input.itemId, serial: displaySerial(state.serial) });
      const bornFirst = first.from.release.id === releases[0]!.id;
      const rows: DocumentItemHistoryRow[] = [];
      periods.forEach((period, index) => {
        const previous = periods[index - 1];
        const next = periods[index + 1];
        rows.push({
          kind: 'period',
          dateFrom: dateOf(period.from.release),
          dateTo: period.to.release.id === latestId ? null : dateOf(period.to.release),
          versionFrom: period.from.release.versionTag,
          versionTo: period.to.release.versionTag,
          cells: [{
            itemId: input.itemId,
            serial: displaySerial(period.to.serial),
            renamedFrom: previous && previous.to.serial !== period.to.serial ? displaySerial(previous.to.serial) : null,
            lang: period.to.lang,
            isFallback: period.to.isFallback,
            text: period.to.text,
            diff: threeWayTextDiff(
              previous && previous.to.lang === period.to.lang ? previous.to.text : null,
              period.to.text,
              next && next.to.lang === period.to.lang ? next.to.text : null,
            ),
            changed: previous == null || previous.to.text !== period.to.text,
            state: index === 0 && !bornFirst ? 'added' : null,
          }],
        });
      });
      if (!alive) {
        const gone = releases.find(row => row.versionTag > last.to.release.versionTag)!;
        rows.push({ kind: 'event', event: { kind: 'removed', date: dateOf(gone), from: [party(last.to)], to: [] } });
      }
      return {
        document: { id: document.id, slug: document.slug, name: document.title, origin: document.origin, settings: document.settings },
        entry: {
          itemId: input.itemId,
          serial: displaySerial(last.to.serial),
          excerpt: last.to.text,
          firstDate: dateOf(first.from.release),
          lastDate: alive ? null : dateOf(last.to.release),
          lineageCount: 1,
          periodCount: periods.length,
        },
        rows,
      };
    },
  };
}
