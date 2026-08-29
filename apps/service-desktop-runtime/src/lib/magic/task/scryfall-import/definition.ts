import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { importScryfallCards, importScryfallRulings, importScryfallSets } from '../../scryfall/import';
import type { ImportCounts } from '../../upsert';

/** Stable task type for importing Scryfall bulk files into the scryfall caches. */
export const magicScryfallImportTaskType = 'magic_scryfall_import';

const importCounts = z.object({
  inserted:  z.number(),
  updated:   z.number(),
  unchanged: z.number(),
  deleted:   z.number(),
});

const input = z.object({
  cards:   z.string().optional(),
  sets:    z.string().optional(),
  rulings: z.string().optional(),
});

const output = z.object({
  cards:   importCounts,
  sets:    importCounts,
  rulings: importCounts,
});

type TableCounts = Record<'cards' | 'sets' | 'rulings', ImportCounts>;

const emptyCounts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };

/** Serializable import cursor persisted after every completed bulk file. */
interface ImportBlockState {
  stage:   number; // 0 = cards, 1 = sets, 2 = rulings
  cards:   ImportCounts;
  sets:    ImportCounts;
  rulings: ImportCounts;
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
    return { blockInput: { stage: 0, cards: emptyCounts, sets: emptyCounts, rulings: emptyCounts } satisfies ImportBlockState };
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
