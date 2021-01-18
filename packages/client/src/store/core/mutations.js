import { LocalStorage } from 'quasar';

export function event() {}

export function games(state, newValue) {
    state.games = newValue;
}

export function user(state, newValue) {
    state.user = newValue;
}

export function locale(state, newValue) {
    LocalStorage.set('locale', newValue);
    state.locale = newValue;
}

export function search(state, newValue) {
    state.search = newValue;
}

export function title(state, newValue) {
    state.page.title = newValue;

    document.title = newValue;
}

export function pageOptions(state, newValue) {
    state.pageOptions = newValue;

    const paramOptions = newValue?.params ?? {};
    const paramKeys = Object.keys(paramOptions);

    state.page.params = Object.fromEntries(paramKeys.map(k => {
        const paramOption = paramOptions[k];

        if (Array.isArray(paramOption)) {
            const initial = paramOption.find(v => v.initial);

            if (initial != null) {
                return [k, initial.value];
            }

            const first = paramOption[0];

            if (first == null) {
                return [k, null];
            }

            if (first.value) {
                return [k, first.value];
            } else {
                return [k, first];
            }
        }
    }));
}

export function param(state, { key, value }) {
    const option = state.pageOptions?.params?.[key];

    if (option != null) {
        if (Array.isArray(option)) {
            for (const o of option) {
                if (o === value || o.value === value) {
                    state.page.params[key] = value;
                    return;
                }
            }
        }
    }
}
