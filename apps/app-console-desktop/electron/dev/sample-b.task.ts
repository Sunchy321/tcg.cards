import { registerTask } from '../task/registry';
import { stepsOf } from './controlled';

registerTask({
  taskType:       'dev_sample_b',
  label:          '测试任务 B',
  version:        '1',
  supportsResume: false,
  scope:          params => ({ type: 'dev', key: `b-${stepsOf(params)}` }),
  load:           () => import('./sample-b-definition'),
});
