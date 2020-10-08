export function setBooted(state) {
    state.isBooted = true;
}

export function games(state, newValue) {
    state.games = newValue;
}

export function user(state, newValue) {
    state.user = newValue;
}
