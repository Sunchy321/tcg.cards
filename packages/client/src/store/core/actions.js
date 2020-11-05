import { api } from 'src/boot/backend';

export async function boot({ commit, dispatch }) {
    const { data: rootData } = await api.get('/');

    dispatch('locale/init', rootData);

    commit('games', rootData.games);

    await dispatch('user/refresh');
}
