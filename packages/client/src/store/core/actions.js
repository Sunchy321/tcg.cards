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
    const { data: profile } = await user.get('/profile');

    if (profile.failure == null) {
        dispatch('login', profile);
    }
}

export function login({ commit }, profile) {
    commit('user', profile);
}

export function logout({ commit }) {
    commit('user', null);
}
