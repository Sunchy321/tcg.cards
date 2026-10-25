import { registerTask } from '../task/registry';
import { stepsOf } from './controlled';

registerTask({
  taskType:       'dev_sample',
  label:          '测试任务',
  version:        '1',
  supportsResume: true,
  // The scope follows the step count so one task type still spans several scopes.
  scope:          params => ({ type: 'dev', key: String(stepsOf(params)) }),
  load:           () => import('./sample-definition'),
});
