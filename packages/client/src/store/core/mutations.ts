/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { State } from './state';

import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { ParamObject, Action } from 'setup/page';
import { Game } from '../games';

import { LocalStorage } from 'quasar';

import router from 'src/router';

import { locales } from './getters';

type StateWithRoute = State & { readonly route: RouteLocationNormalizedLoaded };

export function game(state: State, newValue: Game | null): void {
    state.game = newValue;
}

export function locale(state: State, newValue: string): void {
    if (locales().includes(newValue)) {
        LocalStorage.set('locale', newValue);
        state.locale = newValue;
    }
}

export function search(state: State, newValue: string): void {
    state.search = newValue;
}

export function title(state: State, newValue: string): void {
    state.title = newValue;
    document.title = newValue;
}

export function titleType(state: State, newValue: string): void {
    state.titleType = newValue;
}

export function params(state: State, newValue: Record<string, ParamObject<any, boolean>>): void {
    state.params = newValue;
}

export function param(state: State, { key, value }: { key: string, value: any }): void {
    const { route } = state as StateWithRoute;

    const paramValue = state.params?.[key];

    if (paramValue == null || paramValue.readonly) {
        return;
    }

    switch (paramValue.type) {
    case 'number':
        if (Number.isNaN(Number.parseInt(value, 10))) {
            return;
        }
        break;
    default:
    }

    const realKey = paramValue.key ?? key;

    switch (paramValue.bind) {
    case 'params':
        void router.push({
            params: { ...route.params, [realKey]: value ?? undefined },
            query:  route.query,
        });
        break;
    case 'query':
        void router.push({
            query: { ...route.query, [realKey]: value ?? undefined },
        });
        break;
    case 'props':
        paramValue.value = value;
        break;
    default:
    }
}

export function actions(state: State, actionList: Action[]): void {
    state.actions = actionList;
}
