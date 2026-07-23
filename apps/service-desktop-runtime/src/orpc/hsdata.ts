import { ORPCError, eventIterator } from '@orpc/server';
import { runWithDb } from '@tcg-cards/db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Patch, PatchState, RawEntitySnapshot } from '@tcg-cards/db/schema/local/hearthstone';
import { TaskRun } from '@tcg-cards/db/schema/local/task';

import { os } from './index';
import { computeShortName } from '../lib/hearthstone/hsdata-import';
import {
  collectAllPatchMeta,
  getHsdataRepoState,
  listHsdataSources,
  readHsdataSource,
  syncHsdataRemoteVersions,
} from '../lib/hearthstone/hsdata-repo';
import {
  getLocalHsdataOverview,
  listLocalHsdataSourceVersions,
} from '../lib/hearthstone/hsdata-status';
import { getLocalDb } from '../lib/hearthstone/hsdata-local-db';
import { cancelIncompletePublishBatch, getIncompletePublishBatch, listPublishBatches, publishReport, publishSingleCard, singleCardPublishReport, ensureRemotePublishRegistration } from '../lib/hearthstone/hsdata-publish';
import { createTaskStore } from '#task/store';

const sourceIdInput = z.strictObject({
  id: z.string().trim().min(1),
});

const publishStreamInput = z.strictObject({
  publishTarget: z.literal('hearthstone'),
  environment:   z.string().trim().min(1),
});

const sourceFile = z.object({
  id:           z.string(),
  name:         z.string(),
  kind:         z.union([z.literal('tag'), z.literal('worktree')]),
  size:         z.number(),
  time:         z.string().optional(),
  sourceTag:    z.number().optional(),
  sourceCommit: z.string(),
  shortCommit:  z.string(),
  sourceUri:    z.string(),
});

const repoState = z.object({
  repoPath: z.string().optional(),
});

const syncResult = z.object({
  repoPath: z.string(),
  remote:   z.string(),
});

const sourceVersionStatus = z.object({
  sourceTag:        z.number(),
  build:            z.number().nullable(),
  sourceCommit:     z.string(),
  sourceUri:        z.string(),
  importStatus:     z.string(),
  importedAt:       z.string().nullable(),
  projectionStatus: z.string(),
  projectedAt:      z.string().nullable(),
  projectionError:  z.string().nullable(),
  unpackStatus:     z.string(),
  unpackedAt:       z.string().nullable(),
});

/** Reads one object-like cause from an unknown thrown value. */
const readErrorCause = (error: unknown) => {
  let current = error;

  while (current != null && typeof current === 'object') {
    if ('error' in current && (current as { error?: unknown }).error != null) {
      current = (current as { error: unknown }).error;
      continue;
    }

    if (!('cause' in current)) {
      return null;
    }

    const cause = (current as { cause?: unknown }).cause;
    if (cause == null || typeof cause !== 'object') {
      return null;
    }

    if ('code' in cause || 'detail' in cause || 'hint' in cause || 'constraint' in cause) {
      return cause as Record<string, unknown>;
    }

    current = cause;
  }

  return null;
};

/** Builds one compact database error message from a wrapped query failure. */
const formatDbErrorMessage = (error: unknown) => {
  const cause = readErrorCause(error);
  if (cause == null) {
    return null;
  }

  const code = typeof cause.code === 'string' ? cause.code : null;
  const detail = typeof cause.detail === 'string' ? cause.detail : null;
  const hint = typeof cause.hint === 'string' ? cause.hint : null;
  const constraint = typeof cause.constraint === 'string' ? cause.constraint : null;
  const table = typeof cause.table === 'string' ? cause.table : null;
  const column = typeof cause.column === 'string' ? cause.column : null;
  const causeMessage = typeof cause.message === 'string' ? cause.message : null;

  if (
    code == null
    && detail == null
    && hint == null
    && constraint == null
    && table == null
    && column == null
    && causeMessage == null
  ) {
    return null;
  }

  const header = [
    'Database query failed',
    code ? `(${code})` : null,
    table ? `on ${table}` : null,
    column ? `column ${column}` : null,
    constraint ? `constraint ${constraint}` : null,
  ]
    .filter(part => part != null)
    .join(' ');
  const body = detail ?? causeMessage;

  return hint != null
    ? `${header}: ${body ?? 'No detail available'}. Hint: ${hint}`
    : `${header}: ${body ?? 'No detail available'}`;
};

/** Formats one thrown value into the short message shown to desktop clients. */
const formatRuntimeErrorMessage = (error: unknown) => {
  if (error instanceof ORPCError) {
    return error.message;
  }

  const dbMessage = formatDbErrorMessage(error);
  if (dbMessage != null) {
    return dbMessage;
  }

  if (error instanceof Error) {
    return error.message.startsWith('Failed query:')
      ? 'Database query failed'
      : error.message;
  }

  return String(error);
};

/** Normalizes one thrown value into a runtime RPC error. */
const toRuntimeError = (error: unknown) => {
  if (error instanceof ORPCError) {
    return error;
  }

  if (error instanceof Error) {
    if (
      error.message.includes('is already leased by another publish batch')
      || error.message.includes('lease could not be renewed')
    ) {
      return new ORPCError('CONFLICT', {
        message: error.message,
      });
    }
  }

  return new ORPCError('INTERNAL_SERVER_ERROR', {
    message: formatRuntimeErrorMessage(error),
  });
};

/** Reads the current hsdata repository path already configured in the local runtime. */
const getRepoState = os
  .route({
    method:      'GET',
    description: 'Read the current hsdata repository path',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(repoState)
  .handler(async () => getHsdataRepoState());

/** Refreshes hsdata tags from the configured local repository remote. */
const syncRemoteVersions = os
  .route({
    method:      'POST',
    description: 'Fetch remote hsdata tags into the configured local repository',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(syncResult)
  .handler(async () => {
    try {
      return syncHsdataRemoteVersions();
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Lists hsdata sources discoverable from the configured local repository. */
const listSources = os
  .route({
    method:      'GET',
    description: 'List hsdata sources from the configured local repository',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(z.array(sourceFile))
  .handler(async () => {
    try {
      return listHsdataSources();
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Reads one hsdata XML source from the configured local repository. */
const readSource = os
  .route({
    method:      'GET',
    description: 'Read one hsdata source with its XML payload',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(sourceIdInput)
  .output(sourceFile.extend({
    xml:       z.string(),
    sourceTag: z.number(),
  }))
  .handler(async ({ input }) => {
    try {
      return await readHsdataSource(input.id);
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Lists local hsdata source version rows from the configured PostgreSQL database. */
const listLocalSourceVersions = os
  .route({
    method:      'GET',
    description: 'List local hsdata source versions',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(z.array(sourceVersionStatus))
  .handler(async () => await listLocalHsdataSourceVersions());

/** Reads the local hsdata overview cards from the configured PostgreSQL database. */
const getLocalOverview = os
  .route({
    method:      'GET',
    description: 'Read the local hsdata overview',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(z.any())
  .handler(async () => await getLocalHsdataOverview());

const cancelPublishBatchInput = publishStreamInput.extend({
  batchId: z.uuid(),
});

/** Cancels one residual publish batch row that is still marked running in the local database. */
const cancelIncompletePublishBatchRoute = os
  .route({
    method:      'POST',
    description: 'Cancel one incomplete Hearthstone publish batch left in the local database',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(cancelPublishBatchInput)
  .output(publishReport)
  .handler(async ({ input }) => {
    try {
      const result = await cancelIncompletePublishBatch(input);

      // Also cancel the corresponding TaskRun if it exists
      // Inline cancel: update task run via store if one exists for this batch
      createTaskStore(getLocalDb()).updateTaskRun(input.batchId, { controlRequestKind: 'cancel' }).catch(() => {
        // TaskRun may not exist or already be terminal — that's fine.
      });

      return result;
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Lists publish batches for the current target. */
const listPublishBatchesRoute = os
  .route({
    method:      'GET',
    description: 'List publish batches for the current target',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(publishStreamInput)
  .output(z.array(publishReport))
  .handler(async ({ input }) => {
    try {
      return await listPublishBatches(input);
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Lists publish history from completed/failed/canceled task runs. */
const listPublishHistoryRoute = os
  .route({
    method:      'GET',
    description: 'List publish history from task runs',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(publishStreamInput)
  .output(z.array(publishReport))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    const rows = await db.select()
      .from(TaskRun)
      .where(and(
        eq(TaskRun.taskType, 'hearthstone_publish'),
        sql`${TaskRun.params} ->> 'publishTarget' = ${input.publishTarget}`,
        sql`${TaskRun.params} ->> 'environment' = ${input.environment}`,
      ))
      .orderBy(desc(TaskRun.createdAt))
      .limit(50);

    return rows.map(r => {
      const res = r.result ?? {};
      const params = r.params ?? {};

      return {
        batchId:              r.id,
        publishTarget:        String(params.publishTarget ?? ''),
        environment:          String(params.environment ?? ''),
        targetFingerprint:    String(params.targetFingerprint ?? ''),
        publishType:          String(params.publishType ?? 'card_data'),
        operationKind:        String(params.operationKind ?? 'publish'),
        status:               r.status,
        manifestHash:         String(res.manifestHash ?? ''),
        previousManifestHash: null,
        buildMin:             Number(res.buildMin ?? 0),
        buildMax:             Number(res.buildMax ?? 0),
        totalRowCount:        Number(res.totalRowCount ?? 0),
        changedRowCount:      Number(res.changedRowCount ?? 0),
        insertedRowCount:     Number(res.insertedRowCount ?? 0),
        updatedRowCount:      Number(res.updatedRowCount ?? 0),
        deletedRowCount:      Number(res.deletedRowCount ?? 0),
        unchangedRowCount:    Number(res.unchangedRowCount ?? 0),
        cardRowCount:         Number(res.cardRowCount ?? 0),
        entityRowCount:       Number(res.entityRowCount ?? 0),
        localizationRowCount: Number(res.localizationRowCount ?? 0),
        relationRowCount:     Number(res.relationRowCount ?? 0),
        publishedAt:          r.finishedAt?.toISOString() ?? '',
      };
    });
  });

/** Deletes one publish history record by task run ID. */
const deletePublishHistoryRoute = os
  .route({
    method:      'POST',
    description: 'Delete one publish history record',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(z.object({ taskRunId: z.uuid() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input }) => {
    const db = getLocalDb();
    await db.delete(TaskRun).where(eq(TaskRun.id, input.taskRunId));
    return { success: true };
  });

/** Checks for an incomplete publish batch that can be resumed. */
const getIncompletePublishBatchRoute = os
  .route({
    method:      'GET',
    description: 'Check for an incomplete publish batch',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(publishStreamInput)
  .output(publishReport.nullable())
  .handler(async ({ input }) => {
    try {
      const legacy = await getIncompletePublishBatch(input);

      if (legacy) {
        return legacy;
      }

      // Fallback: check for active TaskRun through the generic store.
      // The page will be migrated to read from getPublishTaskSnapshot in step 8.7.
      return null;
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

/** Publishes a single card from the local projection to the remote target (dev tool). */
const publishSingleCardRoute = os
  .route({
    method:      'POST',
    description: 'Publish a single card to the remote target',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(z.strictObject({
    cardId:        z.string().trim().min(1),
    publishTarget: z.literal('hearthstone'),
    environment:   z.string().trim().min(1),
  }))
  .output(singleCardPublishReport)
  .handler(async ({ input }) => {
    try {
      return await publishSingleCard(input.cardId, input);
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

const registerPublishStreamInput = z.strictObject({
  connectionString:  z.string().trim().min(1),
  publishTarget:     z.string().trim().min(1),
  environment:       z.string().trim().min(1),
  targetFingerprint: z.string().trim().min(1),
});

const registerPublishStreamResult = z.strictObject({
  success: z.boolean(),
});

const registerPublishStreamRoute = os
  .route({
    method:      'POST',
    description: 'Register one remote publish stream so the gate check does not reject it',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(registerPublishStreamInput)
  .output(registerPublishStreamResult)
  .handler(async ({ input }) => {
    try {
      await ensureRemotePublishRegistration(input.connectionString, {
        publishTarget:     input.publishTarget,
        environment:       input.environment,
        publishType:       'card_data',
        targetFingerprint: input.targetFingerprint,
      });
      return { success: true };
    } catch (error) {
      throw toRuntimeError(error);
    }
  });

const batchResetInput = z.strictObject({
  sourceTags: z.array(z.number().int().nonnegative()).min(1),
});

const batchResetResult = z.strictObject({
  resetCount: z.number().int().nonnegative(),
});

/** Resets import status for selected sourceTags to pending so they can be re-imported. */
const resetImportStatus = os
  .route({
    method:      'POST',
    description: 'Batch reset import status for selected sourceTags',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(batchResetInput)
  .output(batchResetResult)
  .handler(async ({ input }) => {
    return await runWithDb(getLocalDb(), async () => {
      const db = getLocalDb();

      const result = await db.update(PatchState)
        .set({
          importStatus:     'pending',
          importedAt:       null,
          projectionStatus: 'not_started',
          projectedAt:      null,
        })
        .where(inArray(PatchState.buildNumber, input.sourceTags))
        .returning({ sourceTag: PatchState.buildNumber });

      return { resetCount: result.length };
    });
  });

/** Resets projection status for selected sourceTags to not_started. */
const resetProjectionStatus = os
  .route({
    method:      'POST',
    description: 'Batch reset projection status for selected sourceTags',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .input(batchResetInput)
  .output(batchResetResult)
  .handler(async ({ input }) => {
    return await runWithDb(getLocalDb(), async () => {
      const db = getLocalDb();

      const result = await db.update(PatchState)
        .set({
          projectionStatus: 'not_started',
          projectedAt:      null,
        })
        .where(inArray(PatchState.buildNumber, input.sourceTags))
        .returning({ sourceTag: PatchState.buildNumber });

      for (const sourceTag of input.sourceTags) {
        await db.update(RawEntitySnapshot)
          .set({ projectionState: 'not_projected' })
          .where(sql<boolean>`${sourceTag} = ANY(${RawEntitySnapshot.sourceTags})`);
      }

      return { resetCount: result.length };
    });
  });

/*
 * ── Hearthstone Task ──────────────────────────────────
 */

/** Groups the desktop runtime hsdata procedures under one router namespace. */
/** Batch-syncs patch metadata (name, shortName, hash) from all hsdata git tags
 *  without parsing XML or touching snapshot/projection data. */
const syncPatches = os
  .route({
    method:      'POST',
    description: 'Sync patch metadata from all hsdata git tags',
    tags:        ['Desktop Runtime', 'Hearthstone', 'Hsdata'],
  })
  .output(z.object({ count: z.number() }))
  .handler(async () => {
    const meta = await collectAllPatchMeta();
    const db = getLocalDb();

    for (const m of meta) {
      const shortName = computeShortName(m.name, m.buildNumber);

      await db.insert(Patch)
        .values({
          buildNumber: m.buildNumber,
          name:        m.name,
          shortName,
          hash:        m.hash,
          releaseDate: m.releaseDate ?? null,
        })
        .onConflictDoUpdate({
          target: [Patch.buildNumber],
          set:    { name: m.name, shortName, hash: m.hash, releaseDate: m.releaseDate ?? null },
        });

      // Ensure a patch_states row exists (don't overwrite existing import state).
      const existing = await db.select({ buildNumber: PatchState.buildNumber })
        .from(PatchState)
        .where(eq(PatchState.buildNumber, m.buildNumber))
        .then(r => r[0]);

      if (!existing) {
        await db.insert(PatchState)
          .values({
            buildNumber:      m.buildNumber,
            commit:           m.commit,
            uri:              '',
            importStatus:     'pending',
            importError:      null,
            projectionStatus: 'not_started',
            projectionError:  null,
            importedAt:       null,
            projectedAt:      null,
          });
      }
    }

    // Fix shortName collisions.
    const patches = await db.select({
      buildNumber: Patch.buildNumber,
      name:        Patch.name,
      shortName:   Patch.shortName,
    })
      .from(Patch)
      .orderBy(Patch.buildNumber);

    const seen = new Map<string, number>();
    for (const p of patches) {
      const existing = seen.get(p.shortName);
      if (existing != null) {
        await db.update(Patch)
          .set({ shortName: p.name })
          .where(eq(Patch.buildNumber, p.buildNumber));
      } else {
        seen.set(p.shortName, p.buildNumber);
      }
    }

    return { count: meta.length };
  });

export const hsdataRouter = {
  syncPatches,
  getRepoState,
  syncRemoteVersions,
  listSources,
  readSource,
  listLocalSourceVersions,
  getLocalOverview,
  cancelIncompletePublishBatch: cancelIncompletePublishBatchRoute,
  listPublishBatches:           listPublishBatchesRoute,
  listPublishHistory:           listPublishHistoryRoute,
  deletePublishHistory:         deletePublishHistoryRoute,
  getIncompletePublishBatch:    getIncompletePublishBatchRoute,
  publishSingleCard:            publishSingleCardRoute,
  registerPublishStream:        registerPublishStreamRoute,
  resetImportStatus,
  resetProjectionStatus,
};
