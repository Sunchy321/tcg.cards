import { registerTask } from '../task/registry';
import { stepsOf } from './controlled';

registerTask({
  taskType:       'dev_publish',
  label:          '发布准入测试任务',
  version:        '1',
  supportsResume: false,
  // Stands in for a real publish so the admission gate runs end to end.
  admission:      { game: 'magic' },
  scope:          params => ({ type: 'dev', key: `publish-${stepsOf(params)}` }),
  load:           () => import('./dev-publish-definition'),
});
