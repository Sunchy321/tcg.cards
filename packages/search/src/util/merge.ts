/* eslint-disable @typescript-eslint/no-empty-object-type */
export type Merge<T, U> = Omit<T, keyof U> & U;

export function merge<T extends {}, U>(value: T, additional: U): Merge<T, U> {
    return { ...value, ...additional } as any;
}
