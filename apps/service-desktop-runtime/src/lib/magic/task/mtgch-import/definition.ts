import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import {
  importMtgchCard,
  importMtgchFlavor,
  importMtgchOracle,
  importMtgchRuling,
  importMtgchSet,
  importMtgchType,
} from '../../mtgch/import';

/** Stable task type for importing the MTGCH zhs export files. */
export const magicMtgchImportTaskType = 'magic_mtgch_import';

const input = z.object({
  card:   z.string().optional(),
  oracle: z.string().optional(),
  flavor: z.string().optional(),
  ruling: z.string().optional(),
  set:    z.string().optional(),
  type:   z.string().optional(),
});

const output = z.object({
  card:   z.number(),
  oracle: z.number(),
  flavor: z.number(),
  ruling: z.number(),
  set:    z.number(),
  type:   z.number(),
});

interface ImportBlockState {
  stage: number; // 0..5
  counts: { card: number; oracle: number; flavor: number; ruling: number; set: number; type: number };
}

const definition = createDefinition(magicMtgchImportTaskType, {
  version:     '2026-08-25:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_mtgch_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('importing', { label: '导入 MTGCH', progressMode: 'unbound', resumeMode: 'durable' })
  .entry(async ({ checkpoint }) => {
    const restored = checkpoint?.blockInput as ImportBlockState | undefined;
    if (restored) return { blockInput: restored };
    return { blockInput: { stage: 0, counts: { card: 0, oracle: 0, flavor: 0, ruling: 0, set: 0, type: 0 } } satisfies ImportBlockState };
  })
  .block(async ({ ctx, blockInput, checkpoint, done }) => {
    const state = blockInput as ImportBlockState;
    if (state.stage >= 6) return done(state);

    const next: ImportBlockState = { ...state, stage: state.stage + 1, counts: { ...state.counts } };
    const db = getLocalDb();
    if (state.stage === 0 && ctx.card) next.counts.card = await runWithDb(db, () => importMtgchCard(ctx.card!));
    else if (state.stage === 1 && ctx.oracle) next.counts.oracle = await runWithDb(db, () => importMtgchOracle(ctx.oracle!));
    else if (state.stage === 2 && ctx.flavor) next.counts.flavor = await runWithDb(db, () => importMtgchFlavor(ctx.flavor!));
    else if (state.stage === 3 && ctx.ruling) next.counts.ruling = await runWithDb(db, () => importMtgchRuling(ctx.ruling!));
    else if (state.stage === 4 && ctx.set) next.counts.set = await runWithDb(db, () => importMtgchSet(ctx.set!));
    else if (state.stage === 5 && ctx.type) next.counts.type = await runWithDb(db, () => importMtgchType(ctx.type!));

    await checkpoint(next);
    return next.stage >= 6 ? done(next) : next;
  })
  .exit(({ blockInput }) => {
    const s = blockInput as ImportBlockState;
    return s.counts;
  })
  .build();

export const magicMtgchImportTaskDefinition = definition;
