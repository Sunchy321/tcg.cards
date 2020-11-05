export function appValues() {
    return ['en', 'zhs'];
}

export function app(state) {
    return state.app;
}

export function gameValues(state) {
    return g => state.gameLocales[g];
}

export function game(state) {
    return g => state.gameValues[g];
}
