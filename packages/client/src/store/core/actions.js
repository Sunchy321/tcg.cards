import axios from 'axios';

import { LocalStorage } from 'quasar';

export async function boot({ commit }) {
    // set locale
    const locale = LocalStorage.getItem('locale');

    if (locale != null && locale !== '') {
        commit('locale/set', locale);
    }

    const { data: basic } = await axios.get('/basic');

    commit('basic', basic);
}
