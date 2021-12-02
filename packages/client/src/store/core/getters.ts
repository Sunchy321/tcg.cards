/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { State } from './state';

import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { Game } from '../games';

import i18n from 'src/i18n';

import { mapValues } from 'lodash';
import { Action, getDefault, ParamObject } from 'setup/page';

type StateWithRoute = State & { readonly route: RouteLocationNormalizedLoaded };

export function games(): Game[] { return ['magic', 'hearthstone']; }
export function game(state: State): Game | null { return state.game; }
export function locales(): string[] { return Object.keys(i18n); }
export function locale(state: State): string { return state.locale; }
export function search(state: State): string { return state.search; }
export function title(state: State): string { return state.title; }
export function titleType(state: State): string { return state.titleType; }
export function actions(state: State): Action[] { return state.actions; }

export function paramValues(state: State): any {
    const { route } = state as StateWithRoute;

    return mapValues(state.params, (param, key) => {
        const defaultValue = getDefault(param);

        const realKey = param.key ?? key;

        switch (param.bind) {
        case 'params': {
            const result = route.params[realKey] as string;

            if (result == null) {
                return defaultValue;
            }

            if (param.type === 'number') {
                const num = Number.parseInt(result, 10);

                if (Number.isNaN(num)) {
                    return defaultValue;
                } else {
                    return num;
                }
            } else {
                return result;
            }
        }
        case 'query': {
            const result = route.query[realKey] as string;

            if (result == null) {
                return defaultValue;
            }

            if (param.type === 'number') {
                const num = Number.parseInt(result, 10);

                if (Number.isNaN(num)) {
                    return defaultValue;
                } else {
                    return num;
                }
            } else {
                return result;
            }
        }
        case 'props':
            return param.value ?? defaultValue;
        default:
            return undefined;
        }
    });
}

export function params(state: State): Record<string, ParamObject<any, boolean> & { value: any }> {
    const values = paramValues(state);

    return mapValues(state.params, (param, key) => ({
        ...param,
        value: values[key],
    }));
}
