import { c } from '../builder';

export type SimpleSetMeta = {
    valueMap:        Record<string, string[]>;
    countDuplicates: boolean;
};

export const simpleSet = c
    .$meta<SimpleSetMeta>({ valueMap: {}, countDuplicates: false })
    .op([':', '='])
    .qual(['!']);
