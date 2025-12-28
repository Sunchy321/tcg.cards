import { c } from '../builder';

export const all = c
    .op([':', '<', '<=', '=', '>', '>='])
    .qual(['!']);
