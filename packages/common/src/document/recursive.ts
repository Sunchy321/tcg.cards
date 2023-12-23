import { isFundamental, isFundamentalArray } from '../meta/type';

import { zip } from 'lodash';

function recursiveImpl(
    values: any[],
    map: (values: any[], index: string[]) => any,
    reduce: (results: any[], values: any[], index: string[]) => any,
    index: string[],
    skipFundamentalArrays: boolean,
): any {
    if (skipFundamentalArrays) {
        if (values.every(v => isFundamental(v) || isFundamentalArray(v))) {
            return map(values, index);
        }
    } else {
        if (values.every(v => isFundamental(v))) {
            return map(values, index);
        }
    }

    if (values.every(v => Array.isArray(v))) {
        const zipped = zip(...values);

        return reduce(
            zipped.map((v, i) => recursiveImpl(v, map, reduce, [...index, `[${i}]`], skipFundamentalArrays)),
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
            Array.from(keys).map(k => recursiveImpl(
                values.map(v => v[k]),
                map,
                reduce,
                [...index, `.${k}`],
                skipFundamentalArrays,
            )),
            values,
            index,
        );
    }

    return map(values, index);
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export default function recursive(
    values: any[],
    map: (values: any[], index: string[]) => any,
    reduce: (results: any[], values: any[], index: string[]) => any = () => {},
    skipFundamentalArrays = true,
): any {
    return recursiveImpl(values, map, reduce, [], skipFundamentalArrays);
}
