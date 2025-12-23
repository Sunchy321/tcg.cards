import { s } from '@search/common';

import * as commands from './command-list';

export const model = s
    .id('lorcana')
    .command(commands)
    .done();
