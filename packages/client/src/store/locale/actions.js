import { LocalStorage } from 'quasar';

export function init({ commit }, rootData) {
    const localeApp = LocalStorage.getItem('locale/app');

    if (localeApp != null) {
        commit('app', localeApp);
    }

    const gameLocales = {};
    const gameValues = {};

    for (const g of rootData.games) {
        const data = rootData[g];

        gameLocales[g] = data.locales;

        const locale = LocalStorage.getItem('locale/' + g);

        if (locale != null) {
            gameValues[g] = locale;
        } else {
            gameValues[g] = data.locales[0];
        }
    }

    commit('gameLocales', gameLocales);
    commit('gameValues', gameValues);
}
