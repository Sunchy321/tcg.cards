export function runTaskInWorker(taskRunId: string, dbUrl: string): void {
  const url = new URL('./worker-entry.ts', import.meta.url).href;
  console.log('[task] spawning worker:', url);
  const worker = new Worker(url);
  worker.postMessage({ taskRunId, dbUrl });
  worker.addEventListener('message', (e) => {
    console.log('[task] Worker done:', e.data);
  });
  worker.addEventListener('error', (err) => {
    console.error('[task] Worker error:', err.message);
  });
  worker.addEventListener('messageerror', (err) => {
    console.error('[task] Worker message error:', err);
  });
}
