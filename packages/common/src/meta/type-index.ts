import { Primitive } from './type';

type ExpandRest<T, R> = [R] extends [never]
    ? [T]
    : R extends []
        ? [T]
        : R extends [infer U, ...infer V]
            ? [T, U, ...V]
            : never;

export type Index<T> = T extends Primitive | ((...args: any[]) => any)
    ? never
    : T extends (infer U)[]
        ? ExpandRest<`[${string}]`, Index<U>>
        : ExpandRest<`.${string & keyof T}`, Index<T[string & keyof T]>>;

export type Access<T, X extends Index<T>> = X extends []
    ? T
    : T extends Primitive
        ? never
        : X extends [infer U, ...infer V]
            ? U extends `[${string}]`
                ? (T extends (infer Y)[] ? Access<Y, V> : never)
                : U extends `.${infer K}`
                    ? (K extends keyof T ? Access<T[K], V> : never)
                    : never
            : never;
