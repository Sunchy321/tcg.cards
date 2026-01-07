import { ClientModel } from '../../model';

import * as commands from './command-list';

export const explain = new ClientModel(commands as any);
