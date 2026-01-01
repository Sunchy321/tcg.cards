import { s } from '@search/index';

import * as commands from './command-list';

export const model = s
    .id('omnisearch')
    .command(commands)
    .done();
