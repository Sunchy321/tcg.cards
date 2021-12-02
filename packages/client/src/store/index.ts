import { createStore, useStore as vuexUseStore, createLogger } from 'vuex';
import type { InjectionKey } from 'vue';

import { Store as CreateStore } from './interface';

import core, { CoreModule } from './core';
import user, { UserModule } from './user';

import games, { Modules } from './games';

export type Store = CreateStore<CoreModule['state'], CoreModule['getters'], CoreModule['mutations'], CoreModule['actions'], Modules & { user: UserModule }>;

export const storeKey: InjectionKey<Store> = Symbol('store');

const store = createStore<CoreModule['state']>({
    state:     core.state,
    getters:   core.getters,
    mutations: core.mutations,
    actions:   core.actions,
    modules:   { user, ...games },
    plugins:   process.env.DEV ? [createLogger()] : [],
    strict:    !!process.env.DEV,
}) as Store;

export default store;

export function useStore(): Store {
    return vuexUseStore(storeKey);
}
