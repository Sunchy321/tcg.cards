import { c as createCommand } from '@search/command';

import * as builtin from '@search/command/builtin';

const c = createCommand
    .use(builtin);

export const raw = c
    .none
    .regex(true)
    .done();

export const name = c
    .text
    .alt('n')
    .done();

export const type = c
    .text
    .alt('t')
    .done();

export const text = c
    .text
    .alt('x')
    .done();

export const order = c
    .simple
    .done();
