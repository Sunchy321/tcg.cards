import i18n from 'src/i18n';

export function locales() { return Object.keys(i18n); }
export function locale(state) { return state.locale; }
export function search(state) { return state.search; }

export function titleOption(state) { return state.pageOptions?.title ?? 'text'; }

export function title(state) { return state.page?.title ?? ''; }

export function params(state) { return state.page?.params ?? {}; }

export function paramDetails(state) {
    const paramOptions = state.pageOptions?.params ?? {};
    const params = state.page?.params ?? {};
    const paramKeys = Object.keys(paramOptions);

    return Object.fromEntries(paramKeys.map(k => {
        const paramOption = paramOptions[k];

        if (Array.isArray(paramOption)) {
            const value = params[k];

            const valueOption = paramOption.find(p => p === value || p.value === value);

            return [k, {
                value,
                label:  valueOption?.label,
                type:   'array',
                option: paramOption,
            }];
        }
    }));
}

export function actions(state) { return state.pageOptions?.actions ?? []; }
