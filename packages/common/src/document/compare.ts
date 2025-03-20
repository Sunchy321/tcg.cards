import { flatten, isEqual } from 'lodash';
import recursive from './recursive';

export default function compare<T>(opeartors: T[], skipFundamentalArrays = true): string[][] {
    return recursive(
        opeartors,
        (values, index) => (values.some(v => !isEqual(v, values[0])) ? [index] : []),
        results => flatten(results),
        skipFundamentalArrays,
    );
}

export function allEqual<T>(opeartors: T[]): boolean {
    return compare(opeartors).length === 0;
}
