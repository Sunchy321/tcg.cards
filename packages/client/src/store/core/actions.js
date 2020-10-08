import { api, user } from '../../boot/axios';

import { LocalStorage } from 'quasar';

export async function boot({ commit, dispatch }) {
    // set locale
    const locale = LocalStorage.getItem('locale');

    if (locale != null && locale !== '') {
        commit('locale/set', locale);
    }

    const { data: root } = await api.get('/');

    commit('games', root.games);

    // try login
    const { data: userData } = await user.get('/profile');

    if (userData.failure == null) {
        dispatch('login', userData);
    }

    commit('setBooted');
}

export async function hasLoggedIn({ getters, dispatch }) {
    if (getters.isBooted) {
        return getters.hasLoggedIn;
    } else {
        const { data: userData } = await user.get('/profile');

        if (userData.failure == null) {
            dispatch('login', userData);
            return true;
        } else {
            return false;
        }
    }
}

export async function isAdmin({ getters, dispatch }) {
    if (getters.isBooted) {
        return getters.isAdmin;
    } else {
        const { data: userData } = await user.get('/profile');

        if (userData.failure == null) {
            dispatch('login', userData);
            return userData.role === 'admin';
        } else {
            return false;
        }
    }
}

export function login({ commit }, user) {
    commit('user', user);
}

export function logout({ commit }) {
    commit('user', null);
}
