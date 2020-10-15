import jwt from 'jsonwebtoken';

export function userToken(state) {
    return state.user ?? localStorage.user;
}

export function user(state, getters) {
    return jwt.decode(getters.userToken);
}

export function isAdmin(state, getters) {
    return getters.user.role === 'admin';
}
