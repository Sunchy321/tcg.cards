import { expect, test } from 'bun:test';
import { createDb } from '@tcg-cards/db/db';
import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { setLocalDatabaseUrlOverride } from '../../../runtime-config';
import { closeLocalDb } from '../../hearthstone/hsdata-local-db';
import { magicRuleRouter } from '../../../orpc/magic-rule';
import { getStore } from '../../../orpc/task';
import { readRelationState } from './relations';
import { documentRelationsTaskDefinition, documentRelationsStage } from '../task/document-relations/definition';
import '../../task/task-definitions';

const url = process.env.RULE_RELATION_TEST_LOCAL_URL;

/** Wait through public state reads until the latest background computation settles. */
async function settled() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = await magicRuleRouter.relationState.callable()({ documentId: 'magic-cr' });
    if (state.task.pageTask.kind === 'attached' && ['completed', 'failed'].includes(state.task.pageTask.status)) return state;
    await Bun.sleep(30);
  }
  throw new Error('Relation computation did not finish');
}

// The caller supplies a disposable database prepared from local document and task schemas.
test.skipIf(!url)('restores relation task progress, completion and failure through local operations', async () => {
  setLocalDatabaseUrlOverride(url!);
  const database = createDb(url!);
  try {
    const service = createDocumentService(createDocumentStore(database, 'local'), { track: 'local' });
    for (const run of await getStore().listActiveTaskRuns()) {
      if (run.taskType === documentRelationsTaskDefinition.taskType) await getStore().updateTaskRun(run.id, { status: 'abandoned', terminalReason: 'abandoned_stale_run', currentStageKey: null, currentStageIndex: null, currentResumeMode: null, finishedAt: new Date() });
    }
    for (const month of ['July', 'August', 'September']) {
      await service.importCr({ content: `Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of ${month} 1, 2026.\n\nIntroduction\n\nExample.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {W} to continue.\n` });
    }
    const definition = documentRelationsTaskDefinition;
    const scope = definition.resolveScope({ documentId: 'magic-cr' });
    const reserved = await getStore().createTaskRun({
      run: { taskType:          definition.taskType, definitionVersion: definition.definitionVersion,
        scope:             { type: definition.scopeType, key: scope.key, snapshot: scope.snapshot as Record<string, unknown> }, params:            {} },
      supportsResume: false,
      stages:         [{ stageKey: documentRelationsStage, stageIndex: 0, label: '计算版本关系', progressMode: 'bounded', resumeMode: 'none' }],
    });
    await expect(magicRuleRouter.computeRelations.callable()({ documentId: 'magic-cr' })).rejects.toMatchObject({ code: 'CONFLICT' });
    await getStore().updateTaskRun(reserved.run.id, { status: 'running', currentStageKey: documentRelationsStage, currentStageIndex: 0 });
    await getStore().updateStage(reserved.run.id, documentRelationsStage, {
      status: 'running', done: 1, total: 5, segments: [{ name: '正在计算 20260701 → 20260801', done: 1, total: 2 }],
    });
    // A new adapter must recover the run and its current version pair from PostgreSQL.
    const restored = await readRelationState(database, 'magic-cr');
    expect(restored.task.pageTask.kind === 'attached' && restored.task.pageTask.status).toBe('running');
    expect(restored.task.stages[0]).toMatchObject({ done: 1, total: 5, segments: [{ name: '正在计算 20260701 → 20260801', done: 1, total: 2 }] });
    await getStore().updateTaskRun(reserved.run.id, { status: 'failed', terminalReason: 'execution_failed', currentStageKey: null, currentStageIndex: null, currentResumeMode: null, errorMessage: '版本关系计算失败，请重试。', finishedAt: new Date() });
    const failure = await magicRuleRouter.relationState.callable()({ documentId: 'magic-cr' });
    expect(failure.task.pageTask.kind === 'attached' && failure.task.pageTask.status).toBe('failed');
    expect(failure.task.pageTask.kind === 'attached' && failure.task.pageTask.finishedAt).toBeTruthy();
    const created = await magicRuleRouter.computeRelations.callable()({ documentId: 'magic-cr' });
    expect(created.pageTask.kind).toBe('attached');
    const complete = await settled();
    expect(complete.task.pageTask.kind === 'attached' && complete.task.pageTask.status).toBe('completed');
    expect(complete.versions.map(row => row.status)).toEqual(['not_needed', 'ready', 'ready']);
    expect(complete.task.stages[0]).toMatchObject({ done: 5, total: 5 });
    expect(complete.task.pageTask.kind === 'attached' && complete.task.pageTask.finishedAt).toBeTruthy();
    expect((await readRelationState(database, 'magic-cr')).task).toEqual(complete.task);
    const documents = createDocumentStore(database, 'local');
    const release = (await documents.releases('magic-cr')).at(-1)!;
    const source = (await documents.revision(release.sourceRevisionId))!;
    const translation = await service.saveTranslation({ documentId:       'magic-cr', sourceRevisionId: source.id, language:         'zhs', nodes:            [
      { sourceNodeId: source.nodes[0]!.id, rawText: '测试译文', translationMethod: 'human' },
    ] });
    try {
      // A translated revision cannot serve as an original: force the real worker
      // down its validation failure path without relying on mocked task states.
      await documents.putRelease({ ...release, sourceRevisionId: translation.id });
      await magicRuleRouter.computeRelations.callable()({ documentId: 'magic-cr' });
      const failed = await settled();
      expect(failed.task.pageTask.kind === 'attached' && failed.task.pageTask.status).toBe('failed');
      expect(failed.task.pageTask.kind === 'attached' && failed.task.pageTask.errorMessage).toBe('版本关系计算失败，请重试。');
      expect((await readRelationState(database, 'magic-cr')).task).toEqual(failed.task);
    } finally {
      await documents.putRelease(release);
    }
    await magicRuleRouter.computeRelations.callable()({ documentId: 'magic-cr' });
    expect((await settled()).task.pageTask).toMatchObject({ status: 'completed' });
  } finally {
    setLocalDatabaseUrlOverride(null);
    await closeLocalDb();
    await database.$client.end({ timeout: 1 });
  }
}, 30000);
