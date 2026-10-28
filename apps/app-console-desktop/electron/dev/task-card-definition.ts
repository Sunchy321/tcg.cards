import type { TaskDefinition } from '../task/registry';

const DELAY_MS = 50;

/** Waits between units and stops promptly when the task host aborts the run. */
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Task stopped'));
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('Task stopped'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Reads a bounded workload size for the local TaskCard demonstration. */
function workloadOf(params: Record<string, unknown>): number {
  const value = params.workload;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 100
    ? value
    : 30;
}

/** Reads the optional midpoint failure flag from task parameters. */
function shouldError(params: Record<string, unknown>): boolean {
  return params.shouldError === true;
}

export default {
  stages: params => {
    const workload = workloadOf(params);
    const fail = shouldError(params);

    return [
      {
        key:          'setup',
        label:        'Phase 1 — Setup',
        total:        10,
        progressMode: 'bounded' as const,
        resumeMode:   'durable' as const,
        async run(context) {
          const startAt = typeof params.startedAt === 'number' ? params.startedAt : Date.now();
          const from = context.resume?.done ?? 0;
          for (let done = from + 1; done <= 10; done++) {
            await delay(DELAY_MS, context.signal);
            await context.checkpoint({ startAt }, { done, total: 10 });
          }
        },
      },
      {
        key:          'process',
        label:        'Phase 2 — Processing',
        total:        workload,
        progressMode: 'bounded' as const,
        resumeMode:   'durable' as const,
        async run(context) {
          const startAt = typeof params.startedAt === 'number' ? params.startedAt : Date.now();
          const from = context.resume?.done ?? 0;
          for (let done = from + 1; done <= workload; done++) {
            await delay(DELAY_MS, context.signal);
            if (fail && done === Math.ceil(workload / 2)) {
              throw new Error('Simulated error for testing');
            }
            await context.checkpoint({ startAt }, { done, total: workload });
          }
        },
      },
      {
        key:          'cleanup',
        label:        'Phase 3 — Cleanup',
        total:        null,
        progressMode: 'simple' as const,
        resumeMode:   'none' as const,
        async run(context) {
          await delay(DELAY_MS, context.signal);
          await context.progress({ done: null });
        },
      },
    ];
  },
  result: params => ({
    completed:      true,
    totalBlocks:    11 + workloadOf(params),
    elapsedMs:      Date.now() - (typeof params.startedAt === 'number' ? params.startedAt : Date.now()),
    errorTriggered: false,
  }),
} satisfies TaskDefinition;
