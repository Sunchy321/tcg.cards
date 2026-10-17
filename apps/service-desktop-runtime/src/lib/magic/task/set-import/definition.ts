import { z } from 'zod';
import { createDefinition } from '../../../task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { fetchSeries, loadBoosterIdentities, prepareSeries, writeSeries, type SeriesInputs } from '../../set-import/store';
import { createPrintLookup, updateBoosters, type BoosterReport, type PrintLookup } from '../../set-import/boosters';
import { boosterStore } from '../../set-import/booster-store';
import type { SourceSeries } from '../../set-import/series';

/** Independent series import with no stage-specific resume operation. */
export const magicSetImportTaskType = 'magic_set_import';
/** Counts and source gaps displayed as product-language results by the desktop page. */
const output = z.object({
  series:             z.number(), boosterSeries:      z.number(),
  missingSeries:      z.array(z.string()), missingSupplements: z.array(z.string()),
});
/** Ephemeral source snapshot shared by the two stages of one non-resumable run. */
interface ImportContext {
  sources: SourceSeries[];
  inputs?: SeriesInputs;
  lookup?: PrintLookup;
  report:  BoosterReport;
}
/** Sequential cursor used only within a running stage, never exposed as a resume option. */
interface Cursor { index: number }

/** Updates metadata first and isolates each complete booster replacement in its own transaction. */
export const magicSetImportTaskDefinition = createDefinition(magicSetImportTaskType, {
  version: '2026-10-17:v1', effectModel: 'reconcilable',
})
  .scope(z.object({}), { type: magicSetImportTaskType, resolve: () => ({ key: 'global', snapshot: {} }) })
  .input(z.object({})).output(output)
  .context({ init: (): ImportContext => ({ sources: [], report: { updated: 0, missing: [], failed: [] } }) })
  .stage('series', { label: '更新系列资料', progressMode: 'bounded', resumeMode: 'none' })
  .entry(async ({ ctx }) => {
    try {
      ctx.sources = await fetchSeries();
      ctx.inputs = await prepareSeries(getLocalDb(), ctx.sources);
    } catch (error) {
      console.error('[magic:set-import] Could not prepare series', error);
      throw new Error('系列资料暂时无法获取或保存，请确认数据服务可用后重试。', { cause: error });
    }
    return { total: ctx.sources.length, blockInput: { index: 0 } as Cursor };
  })
  .block(async ({ ctx, blockInput, progress, done }) => {
    try {
      await writeSeries(getLocalDb(), ctx.sources[blockInput.index]!, ctx.inputs!);
    } catch (error) {
      console.error('[magic:set-import] Could not update series', error);
      throw new Error('系列资料未能全部更新，已完成的更新会保留。请稍后重新运行。', { cause: error });
    }
    const next = { index: blockInput.index + 1 };
    progress({ done: next.index, total: ctx.sources.length });
    return next.index === ctx.sources.length ? done(next) : next;
  })
  .exit(({ ctx }) => ({ series: ctx.sources.length }))
  .stage('boosters', { label: '更新补充包', progressMode: 'bounded', resumeMode: 'none' })
  .entry(async ({ ctx }) => {
    try {
      const { cards, prints } = await loadBoosterIdentities(getLocalDb());
      ctx.lookup = createPrintLookup(cards, prints);
    } catch (error) {
      console.error('[magic:set-import] Could not prepare booster identities', error);
      const missing = ctx.inputs!.missingSupplements.join('、');
      const retired = ctx.inputs!.missingSeries.join('、');
      throw new Error(`系列资料已更新；补充包资料暂时无法读取，原配置已保留。${missing ? `缺少补充资料的系列：${missing}。` : ''}${retired ? `来源中未出现、已保留的系列：${retired}。` : ''}`, { cause: error });
    }
    return { total: ctx.sources.length, blockInput: { index: 0 } as Cursor };
  })
  .block(async ({ ctx, blockInput, progress, done }) => {
    const setId = ctx.sources[blockInput.index]!.code.toLowerCase();
    const report = await updateBoosters([setId], boosterStore(getLocalDb()), ctx.lookup!);
    ctx.report.updated += report.updated;
    ctx.report.failed.push(...report.failed);
    ctx.report.missing.push(...report.missing);
    const next = { index: blockInput.index + 1 };
    progress({ done: next.index, total: ctx.sources.length });
    return next.index === ctx.sources.length ? done(next) : next;
  })
  .exit(({ ctx }) => {
    if (ctx.report.failed.length) {
      const details = ctx.report.failed.map(f => `${f.setId}: ${f.message}`).join('\n');
      const retained = [
        ctx.inputs!.missingSeries.length ? `来源中未出现、已保留的系列：${ctx.inputs!.missingSeries.join('、')}` : '',
        ctx.inputs!.missingSupplements.length ? `缺少补充资料、已保留原资料的系列：${ctx.inputs!.missingSupplements.join('、')}` : '',
      ].filter(Boolean).join('\n');
      throw new Error(`系列资料已更新；${ctx.report.updated} 个系列的补充包已更新，${ctx.report.failed.length} 个失败并保留原配置。\n${details}\n${retained}`);
    }
    return { series:             ctx.sources.length, boosterSeries:      ctx.report.updated,
      missingSeries:      ctx.inputs!.missingSeries, missingSupplements: ctx.inputs!.missingSupplements };
  })
  .build();
