import { c } from '../builder';

export type SimpleSetMeta = {
    valueMap:        Record<string, string[]>;
    countDuplicates: boolean;
};

export const simpleSet = c
    .$meta<SimpleSetMeta>({ valueMap: {}, countDuplicates: false })
    .$type('builtin:simple-set')
    .op([':', '='])
    .qual(['!']);
