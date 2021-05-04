/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { GameOption, GameOptions, GameModule, GameState, GameGetters, GameMutations, GameActions } from './interface';

import { LocalStorage } from 'quasar';

function defaultValue(option: GameOption) {
    if (option.type === 'enum' && option.default) {
        return option.default;
    } else { // option.type === 'number';
        return 0;
    }
}

export function createModule<
    D extends { locales: string[] }, S
>(game: string, options: GameOptions<S>): GameModule<D, S> {
    const state = {
        locale:  'en',
        locales: ['en'],
        data:    undefined,
    } as Partial<GameState<D, S>>;

    const getters = {
        locale:  s => s.locale,
        locales: s => s.locales,
        data:    s => s.data,
    } as GameGetters<D, S>;

    const mutations = {
        locale: (s, v) => {
            LocalStorage.set(`${game}/locale`, v);
            s.locale = v;
        },

        locales: (s, v) => { s.locales = v; },
        data:    (s, v) => { s.data = v; },
    } as GameMutations<D, S>;

    const actions = {
        init ({ commit, rootGetters }, data) {
            const locale = LocalStorage.getItem(`${game}/locale`);

            if (locale != null) {
                commit('locale', locale);
            } else {
                const appLocale = rootGetters.locale;

                if (data.locales.includes(appLocale)) {
                    commit('locale', appLocale);
                } else {
                    commit('locale', data.locales[0]);
                }
            }

            commit('locales', data.locales);

            for (const k in options) {
                const value = LocalStorage.getItem(`${game}/${k}`);

                if (value != null) {
                    commit(k, value);
                }
            }

            commit('data', data);
        },
    } as GameActions<D, S>;

    for (const k in options) {
        const option = options[k];

        // avoid type check
        state[k] = defaultValue(option) as any;
        getters[k] = ((state: S) => state[k]) as any;
        mutations[k] = ((state: S, newValue: any) => {
            LocalStorage.set(`${game}/${k}`, newValue);
            state[k] = newValue;
        }) as any;
    }

    return {
        namespaced: true,
        state:      state as GameState<D, S>,
        getters,
        mutations,
        actions,
    };
}
