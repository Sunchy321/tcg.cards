import { computed, ref, shallowRef } from 'vue';
import type { DocumentReaderChapter, DocumentReaderSection } from '#model/magic/schema/document-page';

/** Identifies the rendered interval within one fetched chapter. */
interface Interval {
  chapter: number;
  start:   number;
  end:     number;
}

/** Fetches a chapter from the currently selected formal document release. */
type ChapterLoader = (chapterNodeId: string) => Promise<DocumentReaderChapter>;

/** Distinguishes explicit navigation from incremental reading requests. */
type Direction = 'navigation' | 'previous' | 'next';

/** Presents small contiguous batches while reusing the existing chapter read contract. */
export function useDocumentStream(chapterIds: () => string[], load: ChapterLoader, batchSize = 40) {
  const intervals = shallowRef<Interval[]>([]);
  const chapters = shallowRef(new Map<number, DocumentReaderChapter>());
  const pending = ref<Direction | null>(null);
  const failed = ref<Direction | null>(null);
  const requests = new Map<number, Promise<DocumentReaderChapter>>();
  let generation = 0;
  let operation = 0;
  let lastTarget = { chapter: '', node: '' };

  const sections = computed<DocumentReaderSection[]>(() => intervals.value.flatMap(interval =>
    chapters.value.get(interval.chapter)?.sections.slice(interval.start, interval.end) ?? []));
  const hasPrevious = computed(() => {
    const first = intervals.value[0];
    return first != null && (first.start > 0 || first.chapter > 0);
  });
  const hasNext = computed(() => {
    const last = intervals.value.at(-1);
    return last != null && (last.end < (chapters.value.get(last.chapter)?.sections.length ?? 0)
      || last.chapter < chapterIds().length - 1);
  });

  /** Invalidates both in-flight reads and cached content on release or locale changes. */
  function reset() {
    generation += 1;
    operation += 1;
    intervals.value = [];
    chapters.value = new Map();
    requests.clear();
    pending.value = null;
    failed.value = null;
  }

  /** Shares chapter requests without allowing an older document to populate the new cache. */
  async function read(index: number) {
    const cached = chapters.value.get(index);
    if (cached) return cached;
    const epoch = generation;
    let request = requests.get(index);
    if (!request) {
      request = load(chapterIds()[index] ?? '');
      requests.set(index, request);
    }
    try {
      const chapter = await request;
      if (epoch === generation) chapters.value = new Map(chapters.value).set(index, chapter);
      return chapter;
    } finally {
      if (requests.get(index) === request) requests.delete(index);
    }
  }

  /** Opens the target in a small local interval instead of rendering every preceding rule. */
  async function open(chapterNodeId: string, nodeId: string) {
    lastTarget = { chapter: chapterNodeId, node: nodeId };
    const token = ++operation;
    failed.value = null;
    if (sections.value.some(section => section.nodeId === nodeId)) {
      pending.value = null;
      return true;
    }
    pending.value = 'navigation';
    try {
      const index = Math.max(0, chapterIds().indexOf(chapterNodeId));
      const chapter = await read(index);
      if (token !== operation) return false;
      const target = Math.max(0, chapter.sections.findIndex(section => section.nodeId === nodeId));
      const start = Math.max(0, target - 8);
      intervals.value = [{ chapter: index, start, end: Math.min(chapter.sections.length, start + batchSize) }];
      return true;
    } catch {
      if (token === operation) failed.value = 'navigation';
      return false;
    } finally {
      if (token === operation) pending.value = null;
    }
  }

  /** Extends the existing reading interval in order, including across empty chapters. */
  async function extend(direction: 'previous' | 'next', beforeCommit?: () => void) {
    if (pending.value || !(direction === 'next' ? hasNext.value : hasPrevious.value)) return false;
    const token = ++operation;
    pending.value = direction;
    failed.value = null;
    try {
      const next = intervals.value.map(interval => ({ ...interval }));
      const edge = direction === 'next' ? next.at(-1)! : next[0]!;
      const chapter = await read(edge.chapter);
      if (token !== operation) return false;
      if (direction === 'next' && edge.end < chapter.sections.length) {
        edge.end = Math.min(chapter.sections.length, edge.end + batchSize);
      } else if (direction === 'previous' && edge.start > 0) {
        edge.start = Math.max(0, edge.start - batchSize);
      } else {
        const step = direction === 'next' ? 1 : -1;
        let index = edge.chapter + step;
        while (index >= 0 && index < chapterIds().length) {
          const adjacent = await read(index);
          if (token !== operation) return false;
          const length = adjacent.sections.length;
          const interval = { chapter: index, start: direction === 'next' ? 0 : Math.max(0, length - batchSize), end: direction === 'next' ? Math.min(length, batchSize) : length };
          if (direction === 'next') next.push(interval);
          else next.unshift(interval);
          if (length) break;
          index += step;
        }
      }
      beforeCommit?.();
      intervals.value = next;
      return true;
    } catch {
      if (token === operation) failed.value = direction;
      return false;
    } finally {
      if (token === operation) pending.value = null;
    }
  }

  /** Retries the failed user operation without discarding already readable text. */
  function retry(beforeCommit?: () => void) {
    if (failed.value === 'navigation') return open(lastTarget.chapter, lastTarget.node);
    if (failed.value) return extend(failed.value, beforeCommit);
    return Promise.resolve(false);
  }

  return { sections, pending, failed, hasPrevious, hasNext, open, extend, reset, retry };
}
