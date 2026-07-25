export function runTaskInWorker(taskRunId: string, dbUrl: string): void {
  const url = new URL('./worker-entry.ts', import.meta.url).href;
  const worker = new Worker(url);
  worker.postMessage({ taskRunId, dbUrl });
  worker.addEventListener('error', (err) => {
    console.error(`[task] Worker error:`, err.message);
  });
}
