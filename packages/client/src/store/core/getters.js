export function isBooted(state) {
    return state.isBooted;
}

export function hasLoggedIn(state) {
    return state.user != null;
}

export function isAdmin(state) {
    return state.user?.role === 'admin';
}

export function profile(state) {
    return state.user;
}

export function locales() {
    return ['enUS', 'zhCN'];
}
