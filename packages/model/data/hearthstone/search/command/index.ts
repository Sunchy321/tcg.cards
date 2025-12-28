import { c as create } from '@search/index';

import * as builtin from '@search/command/builtin';

export const c = create
    .use(builtin);
