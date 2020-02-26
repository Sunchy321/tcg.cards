import { LocalStorage } from 'quasar';

export function set(state, newValue) {
    state.value = newValue;

    LocalStorage.set('locale', newValue);
}
