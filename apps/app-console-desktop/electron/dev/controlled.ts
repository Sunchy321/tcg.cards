import type { TaskDefinition } from '../task/registry';

/** Reads the shared step count so scope and stage plan stay consistent. */
export function stepsOf(params: Record<string, unknown>): number {
  const value = params.steps;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 1000 ? value : 10;
}

/** Waits between progress updates so a controlled task remains observable. */
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Task stopped'));
    }, { once: true });
  });
}

/** Builds one observable single-stage task that continues from persisted progress. */
export function controlledDefinition(stepMs: number, resumeMode: 'none' | 'durable' = 'none'): TaskDefinition {
  return {
    stages: params => {
      const steps = stepsOf(params);
      return [{
        key:   'work',
        label: '执行中',
        total: steps,
        resumeMode,
        async run({ signal, progress, resume }) {
          for (let step = (resume?.done ?? 0) + 1; step <= steps; step++) {
            await delay(stepMs, signal);
            await progress(step);
          }
        },
      }];
    },
    result: () => ({ message: '已完成' }),
  };
}
