import { c } from '../builder';
import { number } from './number';

export type Word =
  { type: 'count', value: string } |
  { type: 'exact', value: string } |
  { type: 'enum', value: string[] };

export type BitMeta = {
    values: string;
    words?: Record<string, Word>;
};

export const bit = c
    .$meta<BitMeta>({ values: '' })
    .$type('builtin:bit')
    .op([':', ...number.options.operators])
    .qual(number.options.qualifiers);
