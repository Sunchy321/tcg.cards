import { LocalStorage } from 'quasar';

export function gameLocales(state, newValue) {
    state.gameLocales = newValue;
}

export function gameValues(state, newValue) {
    state.gameValues = newValue;
}

export function app(state, newValue) {
    LocalStorage.set('locale/app', newValue);
    state.app = newValue;
}

export function game(state, { game, value }) {
    LocalStorage.set('locale/' + game, value);
    state.gameValues = { ...state.gameValues, [game]: value };
}
