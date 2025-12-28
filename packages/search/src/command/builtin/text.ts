import { c } from '../builder';

export const text = c
    .$type('builtin:text')
    .op([':', '='])
    .qual(['!'])
    .regex(true);
