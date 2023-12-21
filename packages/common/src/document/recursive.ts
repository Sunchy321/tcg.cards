import { isFundamental, isFundamentalArray } from '../meta/type';

import { zip } from 'lodash';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function recursive(
    values: any[],
    map: (values: any[], index: string[]) => any,
    reduce: (results: any[], values: any[], index: string[]) => any,
    index: string[] = [],
): any {
    if (values.every(v => isFundamental(v) || isFundamentalArray(v))) {
        return map(values, index);
    }

    if (values.every(v => Array.isArray(v))) {
        const zipped = zip(...values);

        return reduce(
            zipped.map((v, i) => recursive(v, map, reduce, [...index, `[${i}]`])),
            values,
            index,
        );
    }

    if (values.every(v => typeof v === 'object')) {
        const keys = new Set<string>();

        values.forEach(v => {
            Object.keys(v).forEach(k => keys.add(k));
        });

        return reduce(
            Array.from(keys).map(k => recursive(
                values.map(v => v[k]),
                map,
                reduce,
                [...index, `.${k}`],
            )),
            values,
            index,
        );
    }

    return map(values, index);
}
