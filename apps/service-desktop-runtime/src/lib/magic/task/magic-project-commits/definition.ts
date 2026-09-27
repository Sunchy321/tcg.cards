import { z } from 'zod';

import { runWithDb } from '@tcg-cards/db';

import { createDefinition } from '#task/definition';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';
import { matchBatch } from '../../match';
import { loadNameRubyLookup } from '../../name-ruby';
import { loadReversibleRows } from '../../project/assemble';
import {
  loadPrintCommits,
  projectOraclePrints,
  softDeleteStaleManualPrints,
  softDeleteStaleSourcePrints,
  type OraclePrintsContext,
} from '../magic-project/oracle-prints';
import { resolveCommitScope } from './projection';

/** Stable task type for projecting print commits without a full run. */
export const magicProjectCommitsTaskType = 'magic_project_commits';

const ORACLE_CHUNK_SIZE = 50;

const output = z.object({
  oracles:        z.number(),
  unresolved:     z.number(),
  prints:         z.number(),
  printParts:     z.number(),
  manualRecycled: z.number(),
  sourceRecycled: z.number(),
});

interface ChunkState {
  index:      number;
  total:      number;
  counts:     { prints: number, printParts: number };
  /** `cardId|set|number|lang` of the manual prints emitted so far. */
  manualKeys: string[];
  /** `cardId|set|number|lang` of the source prints emitted so far. */
  sourceKeys: string[];
}

interface CommitsProjectCtx extends OraclePrintsContext {
  oracleIds:   string[];
  /** Oracles to project — every oracle with a unit on a scoped card. */
  oracleList:  string[];
  /** CardIds the run re-projects; bounds the manual-print recycle. */
  cardIdScope: Set<string>;
  /** Requested oracles with no resolved unit — their commits stay unprojected. */
  unresolved:  number;
  counts:      { prints: number, printParts: number, manualRecycled: number };
}

const definition = createDefinition(magicProjectCommitsTaskType, {
  version:     '2026-09-25:v1',
  effectModel: 'reconcilable',
})
  .scope(z.object({}), {
    type:    'magic_project_commits',
    resolve: () => ({ key: 'global', snapshot: {} }),
  })
  .input(z.object({ oracleIds: z.array(z.string()).min(1) }))
  .output(output)
  .context({ init: values => values })
  .stage('projecting', { label: '补全投影', progressMode: 'bounded', resumeMode: 'durable' })
  .entry(async ({ ctx, checkpoint }) => {
    const magic = ctx as unknown as CommitsProjectCtx;
    await runWithDb(getLocalDb(), async () => {
      const database = getLocalDb();
      // Match is reused in full — cardId resolution must agree with a full run,
      // including slug resolutions and merge groups that reach beyond the
      // requested oracles. The scope semantics are shared with the synchronous
      // single-commit pass.
      const matched = await matchBatch(database);
      magic.unitToCard = matched.cardIdByUnit;
      const scope = resolveCommitScope(magic.unitToCard, magic.oracleIds);
      magic.cardIdScope = scope.cardIdScope;
      magic.oracleList = scope.oracleList;
      magic.unresolved = scope.unresolved;

      magic.reversibleRows = await loadReversibleRows(database);
      magic.rubies = await loadNameRubyLookup(database);
      magic.printCommits = await loadPrintCommits(database);
      magic.counts = { prints: 0, printParts: 0, manualRecycled: 0 };
    });
    const restored = checkpoint?.blockInput as ChunkState | undefined;
    if (restored) return { total: restored.total, blockInput: restored };
    const total = magic.oracleList.length;
    return { total, blockInput: { index: 0, total, counts: { prints: 0, printParts: 0 }, manualKeys: [], sourceKeys: [] } };
  })
  .block(async ({ ctx, blockInput, progress, checkpoint, done }) => {
    const magic = ctx as unknown as CommitsProjectCtx;
    const chunk = magic.oracleList.slice(blockInput.index, blockInput.index + ORACLE_CHUNK_SIZE);

    const counts = { prints: 0, printParts: 0 };
    const manualKeys: string[] = [];
    const sourceKeys: string[] = [];
    await runWithDb(getLocalDb(), async () => {
      const database = getLocalDb();
      for (let i = 0; i < chunk.length; i++) {
        const wrote = await projectOraclePrints(database, chunk[i]!, magic);
        counts.prints += wrote.prints;
        counts.printParts += wrote.printParts;
        // The recycles' kept sets travel through the checkpoint so a resumed
        // run recycles exactly what it itself emitted.
        manualKeys.push(...wrote.manualKeys);
        sourceKeys.push(...wrote.sourceKeys);
        progress({ done: blockInput.index + i + 1, total: blockInput.total });
      }
    });

    const next: ChunkState = {
      index:  blockInput.index + chunk.length,
      total:  blockInput.total,
      counts: {
        prints:     (blockInput.counts.prints ?? 0) + counts.prints,
        printParts: (blockInput.counts.printParts ?? 0) + counts.printParts,
      },
      manualKeys: [...(blockInput.manualKeys ?? []), ...manualKeys],
      sourceKeys: [...(blockInput.sourceKeys ?? []), ...sourceKeys],
    };
    await checkpoint(next);
    progress({ done: Math.min(next.index, next.total), total: next.total });
    return next.index >= magic.oracleList.length ? done(next) : next;
  })
  .exit(({ ctx, blockInput }) => {
    const magic = ctx as unknown as CommitsProjectCtx;
    return runWithDb(getLocalDb(), async () => {
      // Recycle only within the scoped cards — other cards' prints are not
      // this run's to judge.
      const manualRecycled = await softDeleteStaleManualPrints(
        getLocalDb(),
        new Set(blockInput.manualKeys ?? []),
        magic.cardIdScope,
      );
      const sourceRecycled = await softDeleteStaleSourcePrints(getLocalDb(), blockInput.sourceKeys ?? []);
      return {
        oracles:    magic.oracleList.length,
        unresolved: magic.unresolved,
        prints:     (blockInput.counts.prints ?? 0),
        printParts: (blockInput.counts.printParts ?? 0),
        manualRecycled,
        sourceRecycled,
      };
    });
  })
  .build();

export const magicProjectCommitsTaskDefinition = definition;
