import { ClientModel } from 'src/search/model';

import * as commands from './command-list';

export const explain = new ClientModel(commands as any);
