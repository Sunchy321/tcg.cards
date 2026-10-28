import { runTagPushBatch } from '../../tag-push-progress';
import { requireHearthstonePublishTargetByIdentity } from '../../hsdata-publish-target';
import type { TaskDefinition } from '../../../../../task/registry';

/** Creates the resumable, target-bound Tag commit push task used by Electron. */
export const tagPushTaskDefinition: TaskDefinition = {
  stages(params) {
    const environment = typeof params.environment === 'string' ? params.environment.trim() : '';
    if (!environment) throw new Error('请选择发布目标。');

    return [{
      key:          'push_tag_commits',
      label:        '推送标签变更',
      total:        null,
      progressMode: 'unbound',
      resumeMode:   'durable',
      async run(context) {
        const target = requireHearthstonePublishTargetByIdentity('hearthstone', environment);
        const resumeToken = context.resume?.token;
        const batchId = typeof resumeToken?.batchId === 'string' ? resumeToken.batchId : null;
        const resume = batchId == null
          ? undefined
          : {
            batchId,
            completed: context.resume?.done ?? 0,
            total:     typeof resumeToken?.total === 'number' ? resumeToken.total : null,
          };
        const report = await runTagPushBatch(target.connectionString, async ({ batchId: activeBatchId, completed, total }) => {
          await context.checkpoint({ batchId: activeBatchId, total }, { done: completed, total });
        }, undefined, resume);
        await context.saveResult(report as unknown as Record<string, unknown>);
      },
    }];
  },
};
