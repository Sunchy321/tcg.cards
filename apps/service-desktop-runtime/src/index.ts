import { createTaskStore, createTaskScheduler, createTaskCleanup } from './lib/task';
import { hasLocalDatabaseUrl } from './runtime-config';
import { getLocalDb } from './lib/hearthstone/hsdata-local-db';
import { runtimeApp } from './app';
import './lib/task/task-definitions';

/** Resolves the local listen port from the current process environment. */
function readPort() {
  const raw = process.env.PORT;
  if (raw == null || raw.trim() === '') {
    return 4318;
  }

  const port = Number(raw);
  return Number.isInteger(port) && port > 0 ? port : 4318;
}

// Startup cleanup + background scheduler
if (hasLocalDatabaseUrl()) {
  const store = createTaskStore(getLocalDb());
  const scheduler = createTaskScheduler(store);

  // Abandon stale tasks left by a previous runtime boot before accepting new work
  void createTaskCleanup(store, scheduler).cleanupStartupState().then(() => {
    setInterval(() => void scheduler.trigger(), 30_000);
  });
}

const port = readPort();

Bun.serve({
  port,
  // Bun's 10s default idleTimeout closes in-flight requests before the handler
  // writes a response byte, which cuts off long AI calls. Raise it to the max.
  idleTimeout: 255,
  fetch:       runtimeApp.fetch,
});

console.log(`[service-desktop-runtime] local RPC endpoint http://localhost:${port}/rpc`);
