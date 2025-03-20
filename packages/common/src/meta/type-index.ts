import { Fundamental } from './type';

type Prefix<P, I> = I extends [] ? [P] : I extends [infer U, ...infer V] ? [P, U, ...V] : never;

export type Index<T> = T extends Fundamental
    ? []
    : T extends (infer U)[]
        ? Prefix<`[${string}]`, [] | Index<U>>
        : { [K in keyof T & string]: Prefix<`.${K}`, [] | Index<T[K]>> }[keyof T & string];

export type Access<T, X> = X extends []
    ? T
    : T extends Fundamental
        ? never
        : X extends [infer U, ...infer V]
            ? (U extends `[${string}]`
                ? (T extends (infer Y)[] ? Access<Y, V> : never)
                : U extends `.${infer K}`
                    ? (K extends keyof T ? Access<T[K], V> : never)
                    : never)
            : never;

type Test = {
    a: {
        b: number[];
    };
    c: {
        d: string;
    }[];
};

type I = Index<Test>;

type AddPath<Keys, Path> = Keys extends string | number ? Path extends string | number ? Keys extends number ? `${Path}.${Keys}` | `${Path}[${Keys}]` | `${Path}.[${Keys}]` : `${Path}.${Keys}` : never : never;

type GetObject<T extends object> = {
    [Key in keyof T as T[Key] extends object ? AddPath<keyof GetObject<T[Key]>, Key> | Key : Key]: 1
};

type ObjectKeyPaths<T extends object> = keyof GetObject<T>;

type P = ObjectKeyPaths<Test>;
