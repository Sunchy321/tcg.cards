import jwt from 'jsonwebtoken';

export function token(state) {
    return state.user ?? localStorage.user;
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
