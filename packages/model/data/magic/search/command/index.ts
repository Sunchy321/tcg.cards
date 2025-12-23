import { c as creator } from '@search/common';

import * as builtin from '@search/common/command/builtin';
import { cost } from './cost';
import { numeric } from './numeric';

export const c = creator
    .use({
        ...builtin,
        cost,
        numeric,
    });
