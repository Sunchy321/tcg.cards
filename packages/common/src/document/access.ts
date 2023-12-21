import { TupleToArray } from '../meta/utility';
import { Index, Access } from '../meta/type-index';
import { isFundamental } from '../meta/type';

export function access<T, I extends Index<T>>(value: T, index: I): Access<T, I>;
export function access<T, I extends TupleToArray<Index<T>>>(value: T, index: I): any;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function access(value: any, index: string[]): any {
    if (isFundamental(value)) {
        return value;
    }

    const [first, ...rest] = index[0];

    if (Array.isArray(value)) {
        if (first.startsWith('[') && first.endsWith(']')) {
            const i = Number.parseInt(first.slice(1, -1), 10);

            if (Number.isNaN(i)) {
                throw new Error(`Malformed index: ${first}`);
            }

            return access(value[i], rest);
        } else {
            throw new Error(`Malformed index: ${first}`);
        }
    } else {
        if (first.startsWith('.')) {
            return access(value[first.slice(1)], rest);
        } else {
            throw new Error(`Malformed index: ${first}`);
        }
    }
}
