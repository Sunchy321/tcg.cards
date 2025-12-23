import { s } from '@search/common';

import * as commands from './command-list';

export const model = s
    .id('magic')
    .command(commands)
    .done();
