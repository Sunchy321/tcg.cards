import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { countJsonlLines } from '../../jsonl';
import { importScryfallCards, importScryfallRulings } from '../../scryfall/import';
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
  rulings: z.string().optional(),
});

const output = z.object({
  cards:   importCounts,
  rulings: importCounts,
});

type TableCounts = Record<'cards' | 'rulings', ImportCounts>;

const emptyCounts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };

/** One bounded per-file stage: total line count known up front, done reported per batch. */
interface FileBlockState {
  done:   number;
  total:  number;
  counts: ImportCounts;
}

interface MagicCtx {
  lineCounts: Record<string, number>;
  counts:     TableCounts;
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
  .stage('prepare', { label: '准备', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const magic = ctx as unknown as MagicCtx;
    magic.lineCounts = {};
    if (ctx.cards) magic.lineCounts.cards = await countJsonlLines(ctx.cards);
    if (ctx.rulings) magic.lineCounts.rulings = await countJsonlLines(ctx.rulings);
    magic.counts = { cards: emptyCounts, rulings: emptyCounts };
    return {};
  })
  .stage('cards', { label: '导入 Card', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const total = (ctx as unknown as MagicCtx).lineCounts.cards ?? 0;
    const restored = checkpoint?.blockInput as FileBlockState | undefined;
    if (restored) return { total, blockInput: restored };
    return { total, blockInput: { done: 0, total, counts: emptyCounts } satisfies FileBlockState };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const counts = await runWithDb(getLocalDb(), () => importScryfallCards(ctx.cards!, p => progress({ done: p, total: blockInput.total })));
    const next: FileBlockState = { ...blockInput, done: blockInput.total, counts };
    await checkpoint(next);
    return done(next);
  })
  .exit(({ ctx, blockInput }) => {
    (ctx as unknown as MagicCtx).counts.cards = blockInput.counts;
    return blockInput.counts;
  })
  .stage('rulings', { label: '导入 Ruling', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const total = (ctx as unknown as MagicCtx).lineCounts.rulings ?? 0;
    const restored = checkpoint?.blockInput as FileBlockState | undefined;
    if (restored) return { total, blockInput: restored };
    return { total, blockInput: { done: 0, total, counts: emptyCounts } satisfies FileBlockState };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const counts = await runWithDb(getLocalDb(), () => importScryfallRulings(ctx.rulings!, p => progress({ done: p, total: blockInput.total })));
    const next: FileBlockState = { ...blockInput, done: blockInput.total, counts };
    await checkpoint(next);
    return done(next);
  })
  .exit(({ ctx, blockInput }) => {
    const magic = ctx as unknown as MagicCtx;
    magic.counts.rulings = blockInput.counts;
    return magic.counts;
  })
  .build();

export const magicScryfallImportTaskDefinition = definition;
