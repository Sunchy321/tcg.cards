import { z } from 'zod';

import { createDefinition } from '#task/definition';

const DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const testWorkTaskDefinition = createDefinition('test_work', { version: '2026-06-23:v1', effectModel: 'atomic' })
  .scope(
    z.object({}),
    { type: 'test' as const, resolve: () => ({ key: 'default', snapshot: {} }) },
  )
  .input(z.object({
    workload: z.number().default(100),
    shouldError: z.boolean().optional().default(false),
  }))
  .output(z.object({
    completed: z.boolean(),
    totalBlocks: z.number(),
    elapsedMs: z.number(),
    errorTriggered: z.boolean(),
  }))
  .context({
    init: (input) => ({ workload: input.workload, shouldError: input.shouldError ?? false, startedAt: Date.now() }),
  })

  // setup: 10 items, chunked, bounded
  .stage('setup', { label: 'Phase 1 — Setup', progressMode: 'bounded', resumeMode: 'durable' })
    .entry(async ({ input }) => ({
      total: 10,
      blockInput: { done: 0 },
    }))
    .block(async ({ blockInput, progress, done }) => {
      await sleep(DELAY_MS);
      const next = blockInput.done + 1;
      progress({ done: next, total: 10 });
      if (next >= 10) return done({ done: next });
      return { done: next };
    })
    .exit(() => ({}))

  // process: workload items, chunked, bounded
  .stage('process', { label: 'Phase 2 — Processing', progressMode: 'bounded', resumeMode: 'durable' })
    .entry(async ({ ctx }) => ({
      total: ctx.workload,
      blockInput: { done: 0, total: ctx.workload },
    }))
    .block(async ({ ctx, blockInput, progress, done }) => {
      await sleep(DELAY_MS);
      const next = blockInput.done + 1;

      if (ctx.shouldError && next === Math.ceil(ctx.workload / 2)) {
        throw new Error('Simulated error for testing');
      }

      progress({ done: next, total: blockInput.total });
      if (next >= blockInput.total) return done({ done: next, total: blockInput.total });
      return { done: next, total: blockInput.total };
    })
    .exit(() => ({}))

  // cleanup: simple
  .stage('cleanup', { label: 'Phase 3 — Cleanup', progressMode: 'simple' })
    .handler(async ({ ctx }) => {
      await sleep(DELAY_MS);
      const totalBlocks = 10 + ctx.workload + 1; // setup + process + cleanup
      return {
        completed: true,
        totalBlocks,
        elapsedMs: Date.now() - ctx.startedAt,
        errorTriggered: ctx.shouldError,
      };
    })
  .build();
