import {
    Getter as VuexGetter, Mutation as VuexMutation, ActionHandler as VuexAction, Plugin,
} from 'vuex';

export type Getter<S> = VuexGetter<S, any>;
export type Mutation<S> = VuexMutation<S>;
export type Action<S> = VuexAction<S, any>;

export type ModuleOptions<
    S,
    G extends Record<string, Getter<S>>,
    M extends Record<string, Mutation<S>>,
    A extends Record<string, Action<S>>,
    N extends boolean,
> = {
    namespaced?: N;
    state: S;
    getters: G;
    mutations: M;
    actions: A;
};

export type StoreOptions<
    S,
    G extends Record<string, Getter<S>>,
    M extends Record<string, Mutation<S>>,
    A extends Record<string, Action<S>>,
    O extends Record<string, ModuleOptions<any, any, any, any, any>>,
> = {
    state: S;
    getters: G;
    mutations: M;
    actions: A;
    modules: O;
    plugins: Plugin<any>[];
    strict?: boolean;
    devtool?: boolean;
};
