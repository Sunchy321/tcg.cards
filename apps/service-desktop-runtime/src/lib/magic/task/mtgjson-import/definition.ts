import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { finalizeMtgjsonSets, importMtgjsonSetFile } from '../../mtgjson/import';
import type { ImportCounts } from '../../upsert';

/** Stable task type for importing MTGJSON per-set files into mtgjson_sets. */
export const magicMtgjsonImportTaskType = 'magic_mtgjson_import';

const importCounts = z.object({
  inserted:  z.number(),
  updated:   z.number(),
  unchanged: z.number(),
  deleted:   z.number(),
});

const input = z.object({
  dir: z.string().min(1),
});

const output = z.object({
  sets: importCounts,
});

const emptyCounts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };

interface ImportBlockState {
  fileIndex: number;
  done:      number;
  total:     number;
  counts:    ImportCounts;
}

const definition = createDefinition(magicMtgjsonImportTaskType, {
  version:     '2026-08-25:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_mtgjson_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('importing', { label: '导入 MTGJSON', progressMode: 'unbound', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const restored = checkpoint?.blockInput as ImportBlockState | undefined;
    if (restored) return { blockInput: restored };
    const files = readdirSync(ctx.dir).filter(f => f.endsWith('.json')).sort();
    return { blockInput: { fileIndex: 0, done: 0, total: files.length, counts: emptyCounts } satisfies ImportBlockState };
  })
  .block(async ({ ctx, blockInput, checkpoint, done }) => {
    const state = blockInput as ImportBlockState;
    if (state.fileIndex >= state.total) {
      const deleted = await runWithDb(getLocalDb(), () => finalizeMtgjsonSets(ctx.dir));
      return done({ ...state, counts: { ...state.counts, deleted } });
    }

    const files = readdirSync(ctx.dir).filter(f => f.endsWith('.json')).sort();
    const file = files[state.fileIndex];
    const counts = { ...state.counts };
    if (file) {
      const result = await runWithDb(getLocalDb(), () => importMtgjsonSetFile(join(ctx.dir, file)));
      counts.inserted += result.inserted;
      counts.updated += result.updated;
      counts.unchanged += result.unchanged;
    }
    const next: ImportBlockState = { ...state, fileIndex: state.fileIndex + 1, done: state.done + 1, counts };
    await checkpoint(next);
    if (next.fileIndex >= next.total) {
      const deleted = await runWithDb(getLocalDb(), () => finalizeMtgjsonSets(ctx.dir));
      return done({ ...next, counts: { ...next.counts, deleted } });
    }
    return next;
  })
  .exit(({ blockInput }) => {
    const s = blockInput as ImportBlockState;
    return { sets: s.counts };
  })
  .build();

export const magicMtgjsonImportTaskDefinition = definition;
