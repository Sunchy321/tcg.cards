import { useStore as vuexUseStore, createLogger } from 'vuex';
import type { InjectionKey } from 'vue';

import { createStore } from './typed-vuex';

import core from './core';
import user from './user';

import games from './games';

const store = createStore({
    state:     core.state,
    getters:   core.getters,
    mutations: core.mutations,
    actions:   core.actions,
    modules:   { user, ...games },
    plugins:   process.env.DEV ? [createLogger()] : [],
    strict:    !!process.env.DEV,
});

export default store;

export type Store = typeof store;

export const storeKey: InjectionKey<Store> = Symbol('store');

export function useStore(): Store {
    return vuexUseStore(storeKey) as unknown as Store;
}
