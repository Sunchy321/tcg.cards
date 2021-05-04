import { State } from './state';

import { LocalStorage } from 'quasar';

export function user(state: State, newValue: string) {
    if (newValue != null) {
        state.user = newValue;
        LocalStorage.set('user', newValue);
    } else {
        state.user = null;
        LocalStorage.remove('user');
    }
}
