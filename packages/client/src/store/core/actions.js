import { LocalStorage } from 'quasar';

import { api } from 'src/boot/backend';

async function loadData(data, { commit, dispatch }) {
    commit('games', data.games);

    for (const g of data.games) {
        dispatch(g + '/init', data[g]);
    }

    await dispatch('user/refresh');
}

export async function boot({ commit, dispatch }) {
    const locale = LocalStorage.getItem('locale');

    if (locale != null) {
        commit('locale', locale);
    }

    const localData = LocalStorage.getItem('data');

    if (localData != null) {
        await loadData(localData, { commit, dispatch });
    }

    const { data: serverData } = await api.get('/');

    LocalStorage.set('data', serverData);

    await loadData(serverData, { commit, dispatch });
}
