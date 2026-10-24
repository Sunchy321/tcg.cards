import { registerTask } from '../task/registry';

registerTask({
  taskType:       'dev_sample',
  label:          '测试任务',
  version:        '1',
  supportsResume: false,
  scope:          () => ({ type: 'dev', key: 'sample' }),
  load:           () => import('./sample-definition'),
});
