export type OmitNever<T> = T extends never[] | Record<string, never>
    ? never
    : T extends string | RegExp | ((...args: any[]) => any)
        ? T
        : T extends (infer E)[]
            ? OmitNever<E>[]
            : T extends object
                ? {
                    [K in keyof T as T[K] extends never ? never : K]: OmitNever<T[K]>
                } : T;
