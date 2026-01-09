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
    .op([':', ...number.options.input.operators])
    .qual(number.options.input.qualifiers)
    .$type('builtin:bit');
