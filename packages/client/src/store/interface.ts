import { Store as VuexStore, GetterTree, MutationTree, ActionTree } from 'vuex';

// { a: T, b: U } to T | U
type ObjectToUnion<T> = T[keyof T];

// T | U to T & U
type UnionToIntersection<U> =
    (U extends any ? (arg: U) => void : never) extends ((arg: infer I) => void) ? I : never

    type AddType<T> = {
        [K in keyof T]: T[K] extends (state: any, payload: infer P) => infer R
            ? (type: K, payload: P) => R
            : never;
    }

// convert getter k (s: State) => T to readonly k: T
export type ConvertGetters<G> = {
    readonly [K in keyof G]: G[K] extends (...args: any) => infer R ? R : never;
}

// convert mutation and action k (s: State/ActionContext, payload: P) => V to commit/dispatch(k, payload: P) => V
export type ConvertHandlers<T> = ObjectToUnion<AddType<T>>;

export interface Module<
    N extends boolean,
    S,
    G extends GetterTree<S, any>,
    M extends MutationTree<S>,
    A extends ActionTree<S, any>
> {
    namespaced?: N & boolean;
    state: S;
    getters: G;
    mutations: M;
    actions: A;
}

// convert module members, add essential prefix
type ConvertModule<N, U> = U extends Module<infer B, infer S, infer G, infer M, infer A> ? {
    readonly state: {
        [_ in N & string]: S
    },

    readonly getters: B extends true ? {
        [K in keyof G as `${N & string}/${K & string}`]: G[K]
    } : {
        [K in keyof G]: G[K]
    },

    mutations: B extends true ? {
        [K in keyof M as `${N & string}/${K & string}`]: M[K]
    } : {
        [K in keyof M]: M[K]
    },

    actions: B extends true ? {
        [K in keyof A as `${N & string}/${K & string}`]: A[K]
    } : {
        [K in keyof A]: A[K]
    },
} : never;

// convert all modules
type ConvertModules<U> = {
    [K in keyof U]: ConvertModule<K, U[K]>;
}

// merge all modules
type MergeModule<T, U> = T & UnionToIntersection<ConvertModules<U>[keyof ConvertModules<U>]>;

export type StoreOptions<
    S,
    G extends GetterTree<S, any>,
    M extends MutationTree<S>,
    A extends ActionTree<S, any>,
    U extends Record<string, Module<boolean, any, any, any, any>>
> = MergeModule<{
    state: S;
    getters: G;
    mutations: M;
    actions: A;
}, U>

export type Store<
    S,
    G extends GetterTree<S, any>,
    M extends MutationTree<S>,
    A extends ActionTree<S, any>,
    U extends Record<string, Module<boolean, any, any, any, any>>
> = Omit<VuexStore<StoreOptions<S, G, M, A, U>['state']>, 'getters'> & {
    readonly state: StoreOptions<S, G, M, A, U>['state'];
    readonly getters: ConvertGetters<StoreOptions<S, G, M, A, U>['getters']>;

    commit: ConvertHandlers<StoreOptions<S, G, M, A, U>['mutations']>;
    dispatch: ConvertHandlers<StoreOptions<S, G, M, A, U>['actions']>;
}
