import { registerTask } from '../task/registry';

registerTask({
  taskType:       'dev_task_card',
  label:          'TaskCard 测试任务',
  version:        '2026-10-28:v1',
  supportsResume: true,
  scope:          params => ({ type: 'dev_task_card', key: `workload:${workloadOf(params)}` }),
  load:           () => import('./task-card-definition'),
});

/** Reads the validated workload size used by the TaskCard demo. */
function workloadOf(params: Record<string, unknown>): number {
  const value = params.workload;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 100
    ? value
    : 30;
}
