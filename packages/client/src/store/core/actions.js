import { LocalStorage } from 'quasar';

import { api } from 'src/boot/backend';

export async function boot({ commit, dispatch }) {
    const { data: root } = await api.get('/');

    const locale = LocalStorage.getItem('locale');

    if (locale != null) {
        commit('locale', locale);
    }

    commit('games', root.games);

    for (const g of root.games) {
        dispatch(g + '/init', root[g]);
    }

    await dispatch('user/refresh');
}
