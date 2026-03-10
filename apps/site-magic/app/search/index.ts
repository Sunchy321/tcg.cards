import { ClientModel } from '#search/client/model';

import * as commands from './command-list';

export const explain = new ClientModel(commands as any);
