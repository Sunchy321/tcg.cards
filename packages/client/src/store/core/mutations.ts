/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { State } from './state';

import { RouteLocationNormalizedLoaded } from 'vue-router';
import { ParamObject, Action } from 'setup/page';

import { LocalStorage } from 'quasar';

import router from 'src/router';

type StateWithRoute = State & { readonly route: RouteLocationNormalizedLoaded };

export function games(state: State, newValue: string[]) {
    state.games = newValue;
}

export function locale(state: State, newValue: string) {
    LocalStorage.set('locale', newValue);
    state.locale = newValue;
}

export function search(state: State, newValue: string) {
    state.search = newValue;
}

export function title(state: State, newValue: string) {
    state.title = newValue;
    document.title = newValue;
}

export function titleType(state: State, newValue: string) {
    state.titleType = newValue;
}

export function params(state: State, newValue: Record<any, ParamObject<any, boolean>>) {
    state.params = newValue;
}

export function param(state: State, { key, value }: { key: string, value: any }) {
    const route = (state as StateWithRoute).route;

    const param = state.params?.[key];

    if (param == null || param.readonly) {
        return;
    }

    const realKey = param.key ?? key;

    switch (param.bind) {
    case 'params':
        void router.push({ params: { ...route.params, [realKey]: value } });
        break;
    case 'query':
        void router.push({ query: { ...route.query, [realKey]: value } });
        break;
    case 'props':
        param.value = value;
    }
}

export function actions(state: State, actions: Action[]) {
    state.actions = actions;
}
