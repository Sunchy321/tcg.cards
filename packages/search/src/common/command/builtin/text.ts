import { c } from '../builder';

export const text = c
    .op([':', '='])
    .qual(['!'])
    .regex(true);
