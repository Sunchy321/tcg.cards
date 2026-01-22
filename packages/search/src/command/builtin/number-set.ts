import { c } from '../builder';

export type NumberSetMeta = {
    countDuplicates: boolean;
};

export const numberSet = c
    .$meta<NumberSetMeta>({ countDuplicates: false })
    .op([':', '<', '<=', '=', '>', '>='])
    .qual(['!'])
    .$type('builtin:number-set');
