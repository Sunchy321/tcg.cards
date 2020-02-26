import { LocalStorage } from 'quasar';

export function boot({ commit }) {
    // set locale
    const locale = LocalStorage.getItem('locale');

    if (locale != null && locale !== '') {
        commit('locale/set', locale);
    }
}
