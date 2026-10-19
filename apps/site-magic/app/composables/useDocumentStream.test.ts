/// <reference types="bun" />
import { describe, expect, test } from 'bun:test';
import type { DocumentReaderChapter, DocumentReaderSection } from '#model/magic/schema/document-page';
import { useDocumentStream } from './useDocumentStream';

/** Creates a chapter large enough to expose accidental whole-chapter rendering. */
function chapter(id: string, size: number): DocumentReaderChapter {
  return {
    chapterNodeId: id,
    sections:      Array.from({ length: size }, (_, index): DocumentReaderSection => ({
      nodeId:       `${id}.${index}`,
      entityId:     `${id}.${index}`,
      kind:         'content',
      serial:       `${id}.${index}`,
      text:         `Rule ${index}`,
      navText:      null,
      path:         `${id}/${index}`,
      level:        1,
      parentNodeId: id,
      siblingOrder: index,
      latestChange: null,
      historyCount: 0,
      localeState:  { locale: 'en', status: 'source', isFallback: false },
    })),
  };
}

/** Exposes manual completion for deterministic request-order tests. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('continuous document reading', () => {
  test('opens a small batch, extends in source order, and fetches the next chapter only at its boundary', async () => {
    const reads: string[] = [];
    const stream = useDocumentStream(() => ['1', '2'], async id => {
      reads.push(id);
      return chapter(id, id === '1' ? 95 : 60);
    });
    await stream.open('1', '1.0');
    expect(stream.sections.value).toHaveLength(40);
    expect(reads).toEqual(['1']);
    await stream.extend('next');
    expect(stream.sections.value).toHaveLength(80);
    await stream.extend('next');
    expect(stream.sections.value).toHaveLength(95);
    expect(reads).toEqual(['1']);
    await stream.extend('next');
    expect(stream.sections.value).toHaveLength(135);
    expect(stream.sections.value[94]?.nodeId).toBe('1.94');
    expect(stream.sections.value[95]?.nodeId).toBe('2.0');
    expect(reads).toEqual(['1', '2']);
    await stream.extend('next');
    expect(stream.hasNext.value).toBe(false);
    expect(new Set(stream.sections.value.map(section => section.nodeId)).size).toBe(155);
  });

  test('opens a deep anchor without rendering preceding content and supports reading backwards across chapters', async () => {
    const stream = useDocumentStream(() => ['1', '2'], async id => chapter(id, 300));
    await stream.open('2', '2.240');
    expect(stream.sections.value).toHaveLength(40);
    expect(stream.sections.value.some(section => section.nodeId === '2.240')).toBe(true);
    expect(stream.sections.value[0]?.nodeId).toBe('2.232');
    while (stream.hasPrevious.value) await stream.extend('previous');
    expect(stream.sections.value[0]?.nodeId).toBe('1.0');
    expect(stream.sections.value.at(-1)?.nodeId).toBe('2.271');
    expect(new Set(stream.sections.value.map(section => section.nodeId)).size).toBe(572);
  });

  test('navigates inside already rendered text without losing adjacent content or rereading the chapter', async () => {
    let reads = 0;
    const stream = useDocumentStream(() => ['1'], async id => {
      reads += 1;
      return chapter(id, 100);
    });
    await stream.open('1', '1.0');
    await stream.extend('next');
    await stream.open('1', '1.50');
    expect(stream.sections.value).toHaveLength(80);
    expect(reads).toBe(1);
  });

  test('ignores stale navigation and reading requests after the version changes', async () => {
    const old = deferred<DocumentReaderChapter>();
    let version = 1;
    const stream = useDocumentStream(() => ['1'], async () => version === 1 ? old.promise : chapter('new', 70));
    const initial = stream.open('1', '1.0');
    stream.reset();
    version = 2;
    await stream.open('1', 'new.0');
    old.resolve(chapter('old', 100));
    expect(await initial).toBe(false);
    expect(stream.sections.value[0]?.nodeId).toBe('new.0');
    await stream.extend('next');
    expect(stream.sections.value.at(-1)?.nodeId).toBe('new.69');
    expect(stream.pending.value).toBeNull();
  });

  test('a later anchor wins when two navigations complete in reverse order', async () => {
    const first = deferred<DocumentReaderChapter>();
    const stream = useDocumentStream(() => ['1', '2'], async id => id === '1' ? first.promise : chapter('2', 80));
    const earlier = stream.open('1', '1.0');
    await stream.open('2', '2.50');
    first.resolve(chapter('1', 80));
    expect(await earlier).toBe(false);
    expect(stream.sections.value[0]?.nodeId).toBe('2.42');
  });

  test('retains readable content on a failed boundary request and retries only that boundary', async () => {
    let fail = true;
    const stream = useDocumentStream(() => ['1', '2'], async id => {
      if (id === '2' && fail) throw new Error('offline');
      return chapter(id, 30);
    });
    await stream.open('1', '1.0');
    expect(await stream.extend('next')).toBe(false);
    expect(stream.failed.value).toBe('next');
    expect(stream.sections.value).toHaveLength(30);
    fail = false;
    expect(await stream.retry()).toBe(true);
    expect(stream.sections.value).toHaveLength(60);
    expect(stream.failed.value).toBeNull();
  });

  test('skips empty chapters without trapping continuous reading or duplicating concurrent reads', async () => {
    const next = deferred<DocumentReaderChapter>();
    let reads = 0;
    const stream = useDocumentStream(() => ['1', '2', '3'], async id => {
      reads += 1;
      return id === '3' ? next.promise : chapter(id, id === '1' ? 4 : 0);
    });
    await stream.open('1', '1.0');
    const reading = stream.extend('next');
    expect(await stream.extend('next')).toBe(false);
    next.resolve(chapter('3', 4));
    await reading;
    expect(stream.sections.value.map(section => section.nodeId)).toEqual(['1.0', '1.1', '1.2', '1.3', '3.0', '3.1', '3.2', '3.3']);
    expect(reads).toBe(3);
    expect(stream.hasNext.value).toBe(false);
  });

  test('supports documents without an outline using the same incremental interval', async () => {
    const stream = useDocumentStream(() => [''], async id => chapter(id, 100));
    await stream.open('', '');
    expect(stream.sections.value).toHaveLength(40);
    expect(stream.hasPrevious.value).toBe(false);
    expect(stream.hasNext.value).toBe(true);
  });

  test('measures the retained viewport after a preceding chapter arrives and before inserting its text', async () => {
    const previous = deferred<DocumentReaderChapter>();
    const stream = useDocumentStream(() => ['1', '2'], async id => id === '1' ? previous.promise : chapter('2', 20));
    await stream.open('2', '2.0');
    let viewport = 100;
    let measured: number | undefined;
    let firstBeforeCommit: string | undefined;
    const reading = stream.extend('previous', () => {
      measured = viewport;
      firstBeforeCommit = stream.sections.value[0]?.nodeId;
    });
    viewport = 250;
    previous.resolve(chapter('1', 20));
    await reading;
    expect(measured).toBe(250);
    expect(firstBeforeCommit).toBe('2.0');
    expect(stream.sections.value[0]?.nodeId).toBe('1.0');
  });
});
