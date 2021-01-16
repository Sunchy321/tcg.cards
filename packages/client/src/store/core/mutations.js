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

export function search(state, newValue) {
    state.search = newValue;
}

export function paramOptions(state, newValue) {
    if (newValue.options && newValue.initial) {
        state.paramOptions = newValue.options;
        state.param = newValue.initial;
    } else {
        state.paramOptions = newValue;
        state.param = newValue[0];
    }
}

export function param(state, newValue) {
    if (state.paramOptions.includes(newValue)) {
        state.param = newValue;
    }
}

export function event() {}
