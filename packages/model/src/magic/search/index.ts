import { s } from '#search/index';

import * as commands from './command-list';

export * from './manifest';

export const model = s
  .id('magic')
  .logicalScope(['same-combination', 'same-print'])
  .command(commands)
  .done();
