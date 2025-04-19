type SplitPath<S> = S extends string
    ? S extends `${infer F}.${infer R}` ? [F, ...SplitPath<R>] : [S]
    : never;

type ApplyComputed<T, P, C extends string, V> = P extends [infer F, ...infer R]
    ? R extends []
        ? T extends (infer E)[]
            ? (E & Record<C, V>)[]
            : T & Record<C, V>
        : T extends (infer E)[]
            ? (F extends keyof E ? Omit<E, F> & Record<F, ApplyComputed<E[F], R, C, V>> : never)[]
            : (F extends keyof T ? Omit<T, F> & Record<F, ApplyComputed<T[F], R, C, V>> : never)
    : never;

export type Computed<T, A> = A extends [infer F, ...infer R]
    ? F extends { source: infer S, computed: infer C, type: infer V }
        ? C extends string
            ? R extends []
                ? ApplyComputed<T, SplitPath<S>, C, V>
                : Computed<ApplyComputed<T, SplitPath<S>, C, V>, R>
            : never
        : never
    : never;
