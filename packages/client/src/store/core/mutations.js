import { LocalStorage } from 'quasar';

export function games(state, newValue) {
    state.games = newValue;
}

export function user(state, newValue) {
    state.user = newValue;
}

export function locale(state, newValue) {
    LocalStorage.set('locale', newValue);
    state.locale = newValue;
}

export function event() {}

export function selections(state, newValue) {
    state.selections = newValue;
}
