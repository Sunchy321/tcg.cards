import { c } from '../builder';

export const string = c
    .op([':', '<', '<=', '=', '>', '>='])
    .qual(['!'])
    .$type('builtin:string');
