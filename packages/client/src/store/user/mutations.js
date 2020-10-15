export function user(state, newValue) {
    if (newValue != null) {
        state.user = newValue;
        localStorage.user = newValue;
    } else {
        state.user = null;
        delete localStorage.user;
    }
}
