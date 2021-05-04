import { State, User } from './state';

import jwt from 'jsonwebtoken';

import { LocalStorage } from 'quasar';

export function token(state: State) {
    return state.user ?? LocalStorage.getItem('user');
}

export function user(state: State, getters: { token: string | null }): User | null {
    if (getters.token == null) {
        return null;
    } else {
        return jwt.decode(getters.token) as User;
    }
}

export function isAdmin(state: State, getters: { user: { role: string } }) {
    return getters.user?.role === 'admin';
}
