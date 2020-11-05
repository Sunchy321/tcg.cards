import jwt from 'jsonwebtoken';

import { LocalStorage } from 'quasar';

export function token(state) {
    return state.user ?? LocalStorage.getItem('user');
}

export function user(state, getters) {
    if (getters.token == null) {
        return null;
    } else {
        return jwt.decode(getters.token);
    }
}

export function isAdmin(state, getters) {
    return getters.user?.role === 'admin';
}
