import { api } from 'src/boot/backend';

import { LocalStorage } from 'quasar';

export async function boot({ commit, dispatch }) {
    // set locale
    const locale = LocalStorage.getItem('locale');

    if (locale != null && locale !== '') {
        commit('locale/set', locale);
    }

    const { data: root } = await api.get('/');

    commit('games', root.games);

    await dispatch('user/refresh');

    commit('setBooted');
}
