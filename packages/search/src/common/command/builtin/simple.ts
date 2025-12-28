import { c } from '../builder';

export const simple = c
    .$type('builtin:simple')
    .op([':', '='])
    .qual(['!']);
