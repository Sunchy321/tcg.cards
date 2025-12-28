import { c } from '../builder';

export const number = c
    .$meta({ allowFloat: false })
    .$type('builtin:number')
    .op(['<', '<=', '=', '>', '>='])
    .qual(['!']);
