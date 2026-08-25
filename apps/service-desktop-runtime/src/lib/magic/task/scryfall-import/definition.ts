import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { importScryfallCards, importScryfallRulings, importScryfallSets } from '../../scryfall/import';

/** Stable task type for importing Scryfall bulk files into the scryfall caches. */
export const magicScryfallImportTaskType = 'magic_scryfall_import';

const input = z.object({
  cards:   z.string().optional(),
  sets:    z.string().optional(),
  rulings: z.string().optional(),
});

const output = z.object({
  cards:   z.number(),
  sets:    z.number(),
  rulings: z.number(),
});

/** Serializable import cursor persisted after every completed bulk file. */
interface ImportBlockState {
  stage:   number; // 0 = cards, 1 = sets, 2 = rulings
  cards:   number;
  sets:    number;
  rulings: number;
}

const definition = createDefinition(magicScryfallImportTaskType, {
  version:     '2026-08-25:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_scryfall_import',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('importing', { label: '导入 Scryfall', progressMode: 'unbound', resumeMode: 'durable' })
  .entry(async ({ checkpoint }) => {
    const restored = checkpoint?.blockInput as ImportBlockState | undefined;
    if (restored) return { blockInput: restored };
    return { blockInput: { stage: 0, cards: 0, sets: 0, rulings: 0 } satisfies ImportBlockState };
  })
  .block(async ({ ctx, blockInput, checkpoint, done }) => {
    const state = blockInput as ImportBlockState;
    if (state.stage >= 3) return done(state);

    const next: ImportBlockState = { ...state, stage: state.stage + 1 };
    if (state.stage === 0 && ctx.cards) {
      next.cards = await runWithDb(getLocalDb(), () => importScryfallCards(ctx.cards!));
    } else if (state.stage === 1 && ctx.sets) {
      next.sets = await runWithDb(getLocalDb(), () => importScryfallSets(ctx.sets!));
    } else if (state.stage === 2 && ctx.rulings) {
      next.rulings = await runWithDb(getLocalDb(), () => importScryfallRulings(ctx.rulings!));
    }

    await checkpoint(next);
    return next.stage >= 3 ? done(next) : next;
  })
  .exit(({ blockInput }) => {
    const s = blockInput as ImportBlockState;
    return { cards: s.cards, sets: s.sets, rulings: s.rulings };
  })
  .build();

export const magicScryfallImportTaskDefinition = definition;
