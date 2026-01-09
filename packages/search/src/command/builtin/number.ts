import { c } from '../builder';

export const number = c
    .$meta({ allowFloat: false })
    .op(['<', '<=', '=', '>', '>='])
    .qual(['!'])
    .$type('builtin:number');
