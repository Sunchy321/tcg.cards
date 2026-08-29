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
import { countTarGzEntryLines } from '../../tar-gz';
import type { ImportCounts } from '../../upsert';

/** Stable task type for importing the MTGCH zhs export files. */
export const magicMtgchImportTaskType = 'magic_mtgch_import';

const importCounts = z.object({
  inserted:  z.number(),
  updated:   z.number(),
  unchanged: z.number(),
  deleted:   z.number(),
});

const input = z.object({
  archive: z.string().min(1),
});

const output = z.object({
  card:   importCounts,
  oracle: importCounts,
  flavor: importCounts,
  ruling: importCounts,
  set:    importCounts,
  type:   importCounts,
});

type EntryCounts = Record<'card' | 'oracle' | 'flavor' | 'ruling' | 'set' | 'type', ImportCounts>;

const emptyCounts: ImportCounts = { inserted: 0, updated: 0, unchanged: 0, deleted: 0 };

const ZHS_ENTRIES = ['zhs_card.json', 'zhs_oracle.json', 'zhs_flavor.json', 'zhs_ruling.json', 'zhs_set.json', 'zhs_type.json'] as const;

/** One bounded per-file stage: total line count known up front, done reported per batch. */
interface FileBlockState {
  done:   number;
  total:  number;
  counts: ImportCounts;
}

interface MagicCtx {
  lineCounts: Record<string, number>;
  counts:     EntryCounts;
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
  .stage('prepare', { label: '准备', progressMode: 'simple' })
  .handler(async ({ ctx }) => {
    const magic = ctx as unknown as MagicCtx;
    magic.lineCounts = await countTarGzEntryLines(ctx.archive, [...ZHS_ENTRIES]);
    magic.counts = { card: emptyCounts, oracle: emptyCounts, flavor: emptyCounts, ruling: emptyCounts, set: emptyCounts, type: emptyCounts };
    return {};
  })
  .stage('card', { label: '导入 Card', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const total = (ctx as unknown as MagicCtx).lineCounts["zhs_card.json"] ?? 0;
    const restored = checkpoint?.blockInput as FileBlockState | undefined;
    if (restored) return { total, blockInput: restored };
    return { total, blockInput: { done: 0, total, counts: emptyCounts } satisfies FileBlockState };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const counts = await runWithDb(getLocalDb(), () => importMtgchCard(ctx.archive, p => progress({ done: p, total: blockInput.total })));
    const next: FileBlockState = { ...blockInput, done: blockInput.total, counts };
    await checkpoint(next);
    return done(next);
  })
  .exit(({ ctx, blockInput }) => {
    (ctx as unknown as MagicCtx).counts.card = blockInput.counts;
    return blockInput.counts;
  })
  .stage('oracle', { label: '导入 Oracle', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const total = (ctx as unknown as MagicCtx).lineCounts["zhs_oracle.json"] ?? 0;
    const restored = checkpoint?.blockInput as FileBlockState | undefined;
    if (restored) return { total, blockInput: restored };
    return { total, blockInput: { done: 0, total, counts: emptyCounts } satisfies FileBlockState };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const counts = await runWithDb(getLocalDb(), () => importMtgchOracle(ctx.archive, p => progress({ done: p, total: blockInput.total })));
    const next: FileBlockState = { ...blockInput, done: blockInput.total, counts };
    await checkpoint(next);
    return done(next);
  })
  .exit(({ ctx, blockInput }) => {
    (ctx as unknown as MagicCtx).counts.oracle = blockInput.counts;
    return blockInput.counts;
  })
  .stage('flavor', { label: '导入 Flavor', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const total = (ctx as unknown as MagicCtx).lineCounts["zhs_flavor.json"] ?? 0;
    const restored = checkpoint?.blockInput as FileBlockState | undefined;
    if (restored) return { total, blockInput: restored };
    return { total, blockInput: { done: 0, total, counts: emptyCounts } satisfies FileBlockState };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const counts = await runWithDb(getLocalDb(), () => importMtgchFlavor(ctx.archive, p => progress({ done: p, total: blockInput.total })));
    const next: FileBlockState = { ...blockInput, done: blockInput.total, counts };
    await checkpoint(next);
    return done(next);
  })
  .exit(({ ctx, blockInput }) => {
    (ctx as unknown as MagicCtx).counts.flavor = blockInput.counts;
    return blockInput.counts;
  })
  .stage('ruling', { label: '导入 Ruling', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const total = (ctx as unknown as MagicCtx).lineCounts["zhs_ruling.json"] ?? 0;
    const restored = checkpoint?.blockInput as FileBlockState | undefined;
    if (restored) return { total, blockInput: restored };
    return { total, blockInput: { done: 0, total, counts: emptyCounts } satisfies FileBlockState };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const counts = await runWithDb(getLocalDb(), () => importMtgchRuling(ctx.archive, p => progress({ done: p, total: blockInput.total })));
    const next: FileBlockState = { ...blockInput, done: blockInput.total, counts };
    await checkpoint(next);
    return done(next);
  })
  .exit(({ ctx, blockInput }) => {
    (ctx as unknown as MagicCtx).counts.ruling = blockInput.counts;
    return blockInput.counts;
  })
  .stage('set', { label: '导入 Set', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const total = (ctx as unknown as MagicCtx).lineCounts["zhs_set.json"] ?? 0;
    const restored = checkpoint?.blockInput as FileBlockState | undefined;
    if (restored) return { total, blockInput: restored };
    return { total, blockInput: { done: 0, total, counts: emptyCounts } satisfies FileBlockState };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const counts = await runWithDb(getLocalDb(), () => importMtgchSet(ctx.archive, p => progress({ done: p, total: blockInput.total })));
    const next: FileBlockState = { ...blockInput, done: blockInput.total, counts };
    await checkpoint(next);
    return done(next);
  })
  .exit(({ ctx, blockInput }) => {
    (ctx as unknown as MagicCtx).counts.set = blockInput.counts;
    return blockInput.counts;
  })
  .stage('type', { label: '导入 Type', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const total = (ctx as unknown as MagicCtx).lineCounts["zhs_type.json"] ?? 0;
    const restored = checkpoint?.blockInput as FileBlockState | undefined;
    if (restored) return { total, blockInput: restored };
    return { total, blockInput: { done: 0, total, counts: emptyCounts } satisfies FileBlockState };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const counts = await runWithDb(getLocalDb(), () => importMtgchType(ctx.archive, p => progress({ done: p, total: blockInput.total })));
    const next: FileBlockState = { ...blockInput, done: blockInput.total, counts };
    await checkpoint(next);
    return done(next);
  })
  .exit(({ ctx, blockInput }) => {
    const magic = ctx as unknown as MagicCtx;
    magic.counts.type = blockInput.counts;
    return magic.counts;
  })
  .build();

export const magicMtgchImportTaskDefinition = definition;
