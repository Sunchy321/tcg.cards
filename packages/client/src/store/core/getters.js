import i18n from 'src/i18n';

export function locales() {
    return Object.keys(i18n);
}

export function locale(state) {
    return state.locale;
}

export function search(state) {
    return state.search;
}

export function selections(state) {
    return state.selections;
}
