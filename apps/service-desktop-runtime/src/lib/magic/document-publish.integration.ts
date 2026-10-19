import { expect, test } from 'bun:test';

import { createDb } from '@tcg-cards/db';
import { createDocumentStore } from '@tcg-cards/console-api/lib/magic/documents/database';
import { createDocumentService } from '@tcg-cards/console-api/lib/magic/documents/service';
import { documentReaderPage, documentReaderSummary } from '@tcg-cards/model/magic/schema/document-page';
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import { closeLocalDb } from '../hearthstone/hsdata-local-db';
import { resolveHearthstonePublishTarget as resolvePublishTarget } from '../runtime/desktop-database';
import { setLocalDatabaseUrlOverride, setMagicPublishTargetOverrides } from '../../runtime-config';
import { magicRouter } from '../../orpc/magic';
import { getStore, taskRouter } from '../../orpc/task';
import { createTaskScheduler } from '../task/scheduler';
import { documentPublishTaskDefinition } from './task/document-publish/definition';
import '../task/task-definitions';

/** Waits for the real worker while reading only the public task snapshot endpoint. */
async function finished(snapshot: TaskPageSnapshot) {
  if (snapshot.pageTask.kind !== 'attached') throw new Error('Expected a created task');
  const taskRunId = snapshot.pageTask.taskRunId;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const current = await taskRouter.snapshot.callable()({ taskRunId });
    if (current.pageTask.kind === 'attached' && ['completed', 'failed', 'abandoned', 'canceled'].includes(current.pageTask.status)) return current;
    await Bun.sleep(50);
  }
  throw new Error('Publication task did not finish');
}

// Both URLs must point to prepared, isolated databases, including the existing task tables.
test.skipIf(!process.env.DOCUMENT_TEST_LOCAL_URL || !process.env.DOCUMENT_TEST_REMOTE_URL)('publishes through real tasks, verifies destinations, previews and retries without replacing active tasks', async () => {
  const local = createDb(process.env.DOCUMENT_TEST_LOCAL_URL!);
  const remote = createDb(process.env.DOCUMENT_TEST_REMOTE_URL!);
  const identity = await resolvePublishTarget({ publishTarget: 'magic', environment: 'test', connectionString: process.env.DOCUMENT_TEST_REMOTE_URL! });
  const target = { publishTarget: 'magic', environment: 'test', targetFingerprint: identity.targetFingerprint, connectionString: process.env.DOCUMENT_TEST_REMOTE_URL! };
  const input = { publishTarget: 'magic', environment: 'test', targetFingerprint: identity.targetFingerprint, dryRun: false };
  setLocalDatabaseUrlOverride(process.env.DOCUMENT_TEST_LOCAL_URL!);
  setMagicPublishTargetOverrides([target]);
  try {
    const source = createDocumentService(createDocumentStore(local, 'local'), { track: 'local' });
    const versionTag = '20260701';
    await source.importCr({ content: 'Magic: The Gathering Comprehensive Rules\n\nThese rules are effective as of July 1, 2026.\n\nIntroduction\n\nA publication task test.\n\nContents\n\nCredits\n\n1. Game Concepts\n\n100. General\n\n100.1. Pay {W} to continue.\n' });
    const reader = createDocumentService(createDocumentStore(remote, 'remote'), { track: 'remote' });

    const scope = documentPublishTaskDefinition.resolveScope(input);
    const reserved = await getStore().createTaskRun({
      run: {
        taskType:          documentPublishTaskDefinition.taskType,
        definitionVersion: documentPublishTaskDefinition.definitionVersion,
        scope:             {
          type:     documentPublishTaskDefinition.scopeType,
          key:      scope.key,
          snapshot: scope.snapshot as Record<string, unknown>,
        },
        params: { dryRun: false },
      },
      supportsResume: false,
      stages:         [{ stageKey: 'publish_documents', stageIndex: 0, label: '发布静态文档', progressMode: 'simple', resumeMode: 'none' }],
    });
    await expect(magicRouter.publish.documentPublishTask.callable()(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    const active = await taskRouter.snapshot.callable()({ taskRunId: reserved.run.id });
    expect(active.pageTask.kind === 'attached' && active.pageTask.status).toBe('pending');
    await getStore().updateTaskRun(reserved.run.id, { status: 'abandoned', terminalReason: 'abandoned_stale_run', finishedAt: new Date() });

    const before = await reader.read({ slug: 'magic-cr', versionTag }).catch(() => null);
    const preview = await finished(await magicRouter.publish.documentPublishTask.callable()({ ...input, dryRun: true }));
    expect(preview.pageTask.kind === 'attached' && preview.pageTask.status).toBe('completed');
    expect(preview.result).toMatchObject({ documents: 1, dryRun: true });
    expect(preview.pageTask.kind === 'attached' && preview.pageTask.dryRun).toBe(true);
    // A reused fixture may already have this edition; preview must preserve its exact public state.
    expect(await reader.read({ slug: 'magic-cr', versionTag }).catch(() => null)).toEqual(before);

    const localIdentity = await resolvePublishTarget({ ...input, connectionString: process.env.DOCUMENT_TEST_LOCAL_URL! });
    setMagicPublishTargetOverrides([{ ...target, connectionString: process.env.DOCUMENT_TEST_LOCAL_URL!, targetFingerprint: localIdentity.targetFingerprint }]);
    const sameDatabase = await finished(await magicRouter.publish.documentPublishTask.callable()({ ...input, targetFingerprint: localIdentity.targetFingerprint }));
    expect(sameDatabase.pageTask.kind === 'attached' && sameDatabase.pageTask.status).toBe('failed');
    expect(sameDatabase.pageTask.kind === 'attached' && sameDatabase.pageTask.errorMessage).toBe('发布目标不能是当前本地数据库，请选择远端发布环境。');

    setMagicPublishTargetOverrides([{ ...target, targetFingerprint: 'changed-configuration' }]);
    const failed = await finished(await magicRouter.publish.documentPublishTask.callable()(input));
    expect(failed.pageTask.kind === 'attached' && failed.pageTask.status).toBe('failed');
    expect(failed.pageTask.kind === 'attached' && failed.pageTask.errorMessage).toBe('发布目标配置已变更，请刷新配置后重新发布。');
    setMagicPublishTargetOverrides([target]);
    if (failed.pageTask.kind !== 'attached') throw new Error('Expected failed publication task');
    const retried = await taskRouter.retry.callable()({ taskRunId: failed.pageTask.taskRunId });
    expect(retried.pageTask.kind === 'attached' && retried.pageTask.dryRun).toBe(false);
    await createTaskScheduler(getStore()).trigger();
    const published = await finished(retried);
    expect(published.pageTask.kind === 'attached' && published.pageTask.status).toBe('completed');
    expect(published.result).toMatchObject({ documents: 1, dryRun: false });
    const again = await finished(await magicRouter.publish.documentPublishTask.callable()(input));
    expect(again.result).toEqual(published.result);

    await closeLocalDb();
    const page = documentReaderPage.parse(await reader.read({ slug: 'magic-cr', versionTag }));
    expect(page.sections.find(node => node.nodeId === '100.1')?.text).toBe('Pay {W} to continue.');
    expect(page.files).toEqual([]);
    const { sections: _sections, ...summary } = page;
    expect(documentReaderSummary.parse(summary).versions.some(version => version.versionTag === versionTag)).toBe(true);
  } finally {
    setMagicPublishTargetOverrides([]);
    setLocalDatabaseUrlOverride(null);
    await closeLocalDb();
    await Promise.all([local.$client.end({ timeout: 1 }), remote.$client.end({ timeout: 1 })]);
  }
}, 30000);
