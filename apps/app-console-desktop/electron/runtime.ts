import type { RuntimeRequest, RuntimeResponse } from './contract';

// Electron's utility process provides Node APIs and a private parent message port.
process.parentPort.on('message', ({ data }: { data: RuntimeRequest }) => {
  if (data.method !== 'health' || !Number.isSafeInteger(data.id)) return;

  process.parentPort.postMessage({
    id: data.id,
    result: { runtime: 'node', pid: process.pid, version: process.versions.node },
  } satisfies RuntimeResponse);
});
