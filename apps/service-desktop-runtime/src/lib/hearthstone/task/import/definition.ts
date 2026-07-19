import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';
import { PatchState } from '@tcg-cards/db/schema/local/hearthstone';
import { eq } from 'drizzle-orm';

import { createDefinition } from '#task/definition';
import { importParsedHsdata, type ImportHsdataReport } from '../../hsdata-import';
import { getLocalDb } from '../../hsdata-local-db';
import { listHsdataSources, readHsdataImportSource } from '../../hsdata-repo';

/** Stable task type for single and batch hsdata imports. */
export const hsdataImportTaskType = 'hearthstone_hsdata_import';

const input = z.object({
  sourceIds: z.array(z.string().min(1)).min(1),
  dryRun:    z.boolean().optional().default(false),
  force:     z.boolean().optional().default(false),
  patchOnly: z.boolean().optional().default(false),
});

const output = z.object({
  reports: z.array(z.any()),
});

/** Serializable import cursor persisted after every completed source version. */
interface ImportBlockState {
  sourceIndex: number;
  reports:     ImportHsdataReport[];
}

/** Imports one frozen source list with durable checkpoints between versions. */
const definition = createDefinition(hsdataImportTaskType, {
  version:     '2026-07-18:v1',
  effectModel: 'reconcilable',
})
  .scope(
    z.object({ sourceIds: z.array(z.string()) }),
    {
      type:    'hearthstone_hsdata_import',
      resolve: scope => ({ key: 'global', snapshot: scope }),
    },
  )
  .input(input)
  .output(output)
  .context({ init: values => values })
  .stage('importing', { label: '导入版本', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(({ ctx, checkpoint }) => ({
    total:      ctx.sourceIds.length,
    blockInput: checkpoint?.blockInput as ImportBlockState | undefined ?? {
      sourceIndex: 0,
      reports:     [],
    },
  }))
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    if (blockInput.sourceIndex >= ctx.sourceIds.length) return done(blockInput);

    const sourceId = ctx.sourceIds[blockInput.sourceIndex]!;
    const source = await readHsdataImportSource(sourceId);
    const report = await runWithDb(getLocalDb(), () => importParsedHsdata({
      parsed:      source.parsed,
      buildNumber: source.sourceTag,
      hash:        source.sourceHash,
      name:        source.name,
      commit:      source.sourceCommit,
      uri:         source.sourceUri,
      dryRun:      ctx.dryRun,
      force:       ctx.force,
      patchOnly:   ctx.patchOnly,
    }));
    const next: ImportBlockState = {
      sourceIndex: blockInput.sourceIndex + 1,
      reports:     [...blockInput.reports, report],
    };

    await checkpoint(next);
    progress({ done: next.sourceIndex, total: ctx.sourceIds.length });
    return next.sourceIndex >= ctx.sourceIds.length ? done(next) : next;
  })
  .exit(({ blockInput }) => ({ reports: blockInput.reports }))
  .build();

/** Imports hsdata versions and restores canceled source states to pending. */
export const hsdataImportTaskDefinition = Object.assign(definition, {
  async onCanceled(run: { params: Record<string, unknown> }) {
    const values = input.parse(run.params);
    const sources = await listHsdataSources();
    const sourceIds = new Set(values.sourceIds);
    const sourceTags = sources
      .filter(source => sourceIds.has(source.id) && source.sourceTag != null)
      .map(source => source.sourceTag!);
    await resetCanceledImportStates(sourceTags);
  },
});

/** Resets imported source states after one canceled import task. */
export async function resetCanceledImportStates(sourceTags: number[]): Promise<void> {
  const database = getLocalDb();
  for (const sourceTag of sourceTags) {
    await database.update(PatchState)
      .set({ importStatus: 'pending', importError: null, importedAt: null })
      .where(eq(PatchState.buildNumber, sourceTag));
  }
}
