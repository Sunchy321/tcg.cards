import { Many, pick } from 'lodash';

export function picker<T extends object, U extends keyof T>(...props: Many<U>[]): (obj: T) => Pick<T, U> {
    return obj => pick(obj, ...props);
}
