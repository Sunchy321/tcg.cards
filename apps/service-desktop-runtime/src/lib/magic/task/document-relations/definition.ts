import { z } from 'zod';
import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { formalReleases } from '@tcg-cards/console-api/lib/magic/documents/adjacency';
import { createDefinition } from '../../../task/definition';
import { createTaskStore } from '../../../task/store';
import { getLocalDb } from '../../../hearthstone/hsdata-local-db';

export const documentRelationsTaskType = 'magic_document_relations';
export const documentRelationsStage = 'compute_relations';

/** Compute static correspondence in a worker while publishing progress outside the source transaction. */
export const documentRelationsTaskDefinition = createDefinition(documentRelationsTaskType, { version: '2026-10-23:v1' })
  .scope(z.object({ documentId: z.string().min(1) }), {
    type:    'document_relations',
    resolve: value => ({ key: value.documentId, snapshot: value }),
  })
  .input(z.object({}))
  .output(z.object({ comparisons: z.number().int().nonnegative() }))
  .context({ init: (_input, scope, taskRunId) => ({ documentId: scope.documentId, taskRunId }) })
  .stage(documentRelationsStage, { label: '计算版本关系', progressMode: 'bounded' })
  .entry(async ({ ctx }) => {
    const releases = formalReleases(await createDocumentStore(getLocalDb(), 'local').releases(ctx.documentId));
    return { total: Math.max(0, releases.length - 1) * 2 + 1, blockInput: { comparisons: 0 } };
  })
  .block(async ({ ctx, done, signal }) => {
    const database = getLocalDb();
    const tasks = createTaskStore(database);
    try {
      return done(await createDocumentService(createDocumentStore(database, 'local'), { track: 'local' }).computeRelations({ documentId: ctx.documentId }, {
        signal,
        async onProgress(update) {
          const complete = update.phase === 'completed';
          const saving = update.phase === 'saving';
          const pair = update.fromVersionTag == null || update.toVersionTag == null ? '' : ` ${update.fromVersionTag} → ${update.toVersionTag}`;
          await tasks.updateStage(ctx.taskRunId, documentRelationsStage, {
            done:     complete ? update.total * 2 + 1 : (saving ? update.total : 0) + update.done,
            total:    update.total * 2 + 1,
            segments: [{ name: complete ? '结果已保存' : `${saving ? '正在保存' : '正在计算'}${pair}`, done: update.done, total: update.total }],
          });
        },
      }));
    } catch (cause) {
      throw new Error('版本关系计算失败，请重试。', { cause });
    }
  })
  .exit(({ blockInput }) => blockInput)
  .build();
