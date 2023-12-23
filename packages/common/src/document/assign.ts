/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { TupleToArray } from '../meta/utility';
import { Index, Access } from '../meta/type-index';
import { isFundamental } from '../meta/type';

export function assign<T, I extends Index<T>>(value: T, index: I, newValue: Access<T, I>): void;
export function assign<T, I extends TupleToArray<Index<T>>>(value: T, index: I, newValue: any): void;

export default function assign(value: any, index: string[], newValue: any): void {
    if (isFundamental(value)) {
        return;
    }

    const [first, ...rest] = index;

    if (Array.isArray(value)) {
        if (first.startsWith('[') && first.endsWith(']')) {
            const i = Number.parseInt(first.slice(1, -1), 10);

            if (Number.isNaN(i)) {
                throw new Error(`Malformed index: ${first}`);
            }

            if (rest.length === 0) {
                value[i] = newValue;
            } else {
                assign(value[i], rest, newValue);
            }
        } else {
            throw new Error(`Malformed index: ${first}`);
        }
    } else {
        if (first.startsWith('.')) {
            if (rest.length === 0) {
                value[first.slice(1)] = newValue;
            } else {
                assign(value[first.slice(1)], rest, newValue);
            }
        } else {
            throw new Error(`Malformed index: ${first}`);
        }
    }
}
