export type Sorter<T> = {
    (a: T, b: T): number;

    or(sorter: Sorter<T>): Sorter<T>;
};

function createSorter<T>(func: (a: T, b: T) => number | undefined): Sorter<T> {
    const sorter: any = (a: T, b: T) => func(a, b);

    sorter.or = (other: Sorter<T>) => (a: T, b: T) => {
        const result = sorter(a, b);

        if (result != null && result !== 0) {
            return result;
        }

        return other(a, b);
    };

    return sorter;
}

const numberSorter = createSorter<number>((a, b) => a - b);

const stringSorter = createSorter<string>((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function arrayIndex<T>(array: T[], equalFunc?: (a: T, b: T) => boolean): Sorter<T> {
    const isEqual = (a: T, b: T) => equalFunc?.(a, b) ?? a === b;

    return createSorter((a, b) => {
        const aIndex = array.findIndex(t => isEqual(t, a));
        const bIndex = array.findIndex(t => isEqual(t, b));

        if (aIndex !== -1) {
            if (bIndex !== -1) {
                return numberSorter(aIndex, bIndex);
            } else {
                return -1;
            }
        } else {
            if (bIndex !== -1) {
                return 1;
            } else {
                return 0;
            }
        }
    });
}

export function pick<T extends object, U extends keyof T>(key: U, sorter: Sorter<T[U]>): Sorter<T> {
    return createSorter((a, b) => sorter(a[key], b[key]));
}

export function reverse<T>(sorter: Sorter<T>): Sorter<T> {
    return createSorter((a, b) => sorter(b, a));
}

export function map<T, U>(mapper: (value: T) => U, sorter: Sorter<U>): Sorter<T> {
    return createSorter((a, b) => sorter(mapper(a), mapper(b)));
}

export default {
    number: numberSorter,
    string: stringSorter,

    arrayIndex,
    pick,

    reverse,
    map,
};
