import { registerTask } from '../task/registry';

registerTask({
  taskType:       'dev_sample_crash',
  label:          '异常退出任务',
  version:        '1',
  supportsResume: false,
  scope:          () => ({ type: 'dev', key: 'crash' }),
  load:           () => import('./sample-crash-definition'),
});
