import { c } from '../builder';

export const simple = c
    .op([':', '='])
    .qual(['!'])
    .$type('builtin:simple');
