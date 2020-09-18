import axios from 'axios';

import { LocalStorage } from 'quasar';

const api = axios.create({
    baseURL: process.env.NODE_ENV === 'production' ? 'api.tcg.cards' : '/api'
});

export async function boot({ commit }) {
    // set locale
    const locale = LocalStorage.getItem('locale');

    if (locale != null && locale !== '') {
        commit('locale/set', locale);
    }

    const { data: root } = await api.get('/');

    commit('games', root.games);
}
