import { collectRuntimeOverrides } from '../../runtime-config';

export function runTaskInWorker(taskRunId: string): void {
  const url = new URL('./worker-entry.ts', import.meta.url).href;
  const worker = new Worker(url);
  worker.postMessage({ taskRunId, overrides: collectRuntimeOverrides() });
  worker.addEventListener('error', err => {
    console.error('[task] Worker error:', err.message);
  });
}
