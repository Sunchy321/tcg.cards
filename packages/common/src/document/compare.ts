import { flatten, isEqual as lodashEqual } from 'lodash';
import { recursive } from './recursive';

export function compare<T>(opeartors: T[]): string[][] {
    return recursive(
        opeartors,
        (values, index) => (values.some(v => !lodashEqual(v, values[0])) ? [index] : null),
        (results) => flatten(results.filter(v => v != null)),
    );
}

export function isEqual<T>(opeartors: T[]): boolean {
    return compare(opeartors).length === 0;
}
