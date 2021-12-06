import { ModuleOptions, StoreOptions } from './interface';

/// helpers

// { x: T, y: U } to T | U
type ObjectToUnion<T> = T[keyof T];

// T | U to T & U
type UnionToIntersection<U> =
    (U extends any ? (arg: U) => void : never) extends ((arg: infer I) => void) ? I : never;

// { x: T, y: U } to T & U
type ObjectToIntersection<T> = UnionToIntersection<ObjectToUnion<T>>;

// (type: T, payload: S) => R | (type: U, payload: S) => R to T | U
type TypeUnionWithoutPayload<U, R> = U extends (type: infer T) => R ? T : never;

// (type: T, payload: S) => R | (type: U, payload: S) => R to T | U
type TypeUnionWithPayload<U, S, R> = U extends (type: any) => any
    ? never
    : U extends (type: infer T, payload: S) => R ? T : never;

// { a: (type: T, payload: P) => R, b: (type: U, payload: P) => R }
// { a: (type: T | U, payload: P) => R, b: (type: T | U, payload: P) => R }
type MergeWithPayload<T> = {
    [K in keyof T]: T[K] extends (first: any) => infer R
        ? (type: TypeUnionWithoutPayload<ObjectToUnion<T>, R>) => R
        : T[K] extends (first: any, payload: infer P) => infer R
            ? (type: TypeUnionWithPayload<ObjectToUnion<T>, P, R>, payload: P) => R
            : never;
};

/// type evaluators

type State<S, O> = S & {
    [K in keyof O]: O[K] extends ModuleOptions<infer OS, any, any, any, any> ? OS : never
};

type GetterType<G> = {
    readonly [K in keyof G]: G[K] extends (...args: any[]) => infer R ? R : never;
};

type Getters<G, O> = GetterType<G> & ObjectToIntersection<{
    [OK in keyof O]: O[OK] extends ModuleOptions<any, infer OG, any, any, infer N> ?
        N extends true ? GetterType<{
            [K in keyof OG as `${OK & string}/${K & string}`]: OG[K]
        }> : GetterType<OG>
        : never;
}>;

type CommitType<M> = {
    [K in keyof M]: M[K] extends (state: any) => any
        ? (type: K) => void
        : M[K] extends (state: any, payload: infer P) => any
            ? (type: K, payload: P) => void
            : never;
};

type Commits<M, O> = CommitType<M> & ObjectToIntersection<{
    [OK in keyof O]: O[OK] extends ModuleOptions<any, any, infer OM, any, infer N> ?
        N extends true ? CommitType<{
            [K in keyof OM as `${OK & string}/${K & string}`]: OM[K]
        }> : CommitType<OM>
        : never;
}>;

type DispatchType<A> = {
    [K in keyof A]: A[K] extends (context: any) => infer R
        ? (type: K) => R
        : A[K] extends (context: any, payload: infer P) => infer R
            ? (type: K, payload: P) => R
            : never;
};

type Dispatches<A, O> = DispatchType<A> & ObjectToIntersection<{
    [OK in keyof O]: O[OK] extends ModuleOptions<any, any, any, infer OA, infer N> ?
        N extends true ? DispatchType<{
            [K in keyof OA as `${OK & string}/${K & string}`]: OA[K]
        }> : DispatchType<OA>
        : never;
}>;

export type StoreType<Options> = Options extends StoreOptions<infer S, infer G, infer M, infer A, infer O>
    ? {
        state: State<S, O>;
        getters: Getters<G, O>;
        commit: ObjectToIntersection<MergeWithPayload<Commits<M, O>>>;
        dispatch: ObjectToIntersection<MergeWithPayload<Dispatches<A, O>>>;

        subscribe: (
            fn: (
                mutation: ObjectToUnion<{
                    [K in keyof Commits<M, O>]:
                    Commits<M, O>[K] extends (type: infer T, payload: infer P) => any
                        ? { type: T, payload: P }
                        : never
                }>,
                state: State<S, O>
            ) => any
        ) => (() => void);

        dispatchRaw: Dispatches<A, O>;
        dispatchMerged: MergeWithPayload<Dispatches<A, O>>;

        commitRaw: Commits<M, O>;
        commitMerged: MergeWithPayload<Commits<M, O>>;

        mutationType: ObjectToUnion<{
            [K in keyof Commits<M, O>]: Commits<M, O>[K] extends (type: infer T, payload: infer P) => any
                ? { type: T, payload: P }
                : never
        }>;

        mutationRaw: {
            [K in keyof Commits<M, O>]: Commits<M, O>[K] extends (type: infer T, payload: infer P) => any
                ? { type: T, payload: P }
                : never
        };
    } : never;
