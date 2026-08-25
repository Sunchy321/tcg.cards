import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { importMtgjsonSetFile } from '../../mtgjson/import';

/** Stable task type for importing MTGJSON per-set files into mtgjson_sets. */
export const magicMtgjsonImportTaskType = 'magic_mtgjson_import';

const input = z.object({
  dir: z.string().min(1),
});

const output = z.object({
  sets: z.number(),
});

interface ImportBlockState {
  fileIndex: number;
  done:      number;
  total:     number;
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
    return { blockInput: { fileIndex: 0, done: 0, total: files.length } satisfies ImportBlockState };
  })
  .block(async ({ ctx, blockInput, checkpoint, done }) => {
    const state = blockInput as ImportBlockState;
    if (state.fileIndex >= state.total) return done(state);

    const files = readdirSync(ctx.dir).filter(f => f.endsWith('.json')).sort();
    const file = files[state.fileIndex];
    if (file) {
      await runWithDb(getLocalDb(), () => importMtgjsonSetFile(join(ctx.dir, file)));
    }
    const next: ImportBlockState = { ...state, fileIndex: state.fileIndex + 1, done: state.done + 1 };
    await checkpoint(next);
    return next.fileIndex >= next.total ? done(next) : next;
  })
  .exit(({ blockInput }) => {
    const s = blockInput as ImportBlockState;
    return { sets: s.done };
  })
  .build();

export const magicMtgjsonImportTaskDefinition = definition;
