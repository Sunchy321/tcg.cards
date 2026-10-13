import { collectRuntimeOverrides } from '../../runtime-config';

export function runTaskInWorker(taskRunId: string): void {
  const url = new URL('./worker-entry.ts', import.meta.url).href;
  const worker = new Worker(url);
  worker.postMessage({ taskRunId, overrides: collectRuntimeOverrides() });
  worker.addEventListener('message', e => {
    const data = e.data as { done?: boolean, taskRunId?: string };

    // Workers are single-use: once the run reports done, terminate the thread so
    // lingering worker threads do not accumulate across task runs.
    if (data?.done && data.taskRunId === taskRunId) {
      worker.terminate();
    }
  });
  worker.addEventListener('error', err => {
    console.error('[task] Worker error:', err.message);
    worker.terminate();
  });
}
