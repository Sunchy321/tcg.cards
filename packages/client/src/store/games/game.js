import { LocalStorage } from 'quasar';

function defaultValue(option) {
    if (option.default) {
        return option.default;
    }

    if (option.type === Number) {
        return 0;
    }

    return null;
}

export function generateSetting(game, options) {
    const state = { };
    const getters = { };
    const mutations = { };
    const actions = { };

    state.locale = 'en';
    getters.locale = state => state.locale;
    mutations.locale = (state, newValue) => {
        LocalStorage.set(`${game}/locale`, newValue);
        state.locale = newValue;
    };

    state.locales = ['en'];
    getters.locales = state => state.locales;
    mutations.locales = (state, newValue) => { state.locales = newValue; };

    state.data = {};
    getters.data = state => state.data;
    mutations.data = (state, newValue) => { state.data = newValue; };

    for (const k in options) {
        const option = options[k];

        state[k] = defaultValue(option);
        getters[k] = state => state[k];
        mutations[k] = (state, newValue) => {
            LocalStorage.set(`${game}/${k}`, newValue);
            state[k] = newValue;
        };
    }

    actions.init = function ({ commit, rootGetters }, data) {
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
    };

    return { namespaced: true, state, getters, mutations, actions };
}
