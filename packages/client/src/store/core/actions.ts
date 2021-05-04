/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ActionContext } from 'vuex';
import { RouteLocationNormalizedLoaded } from 'vue-router';
import { State } from './state';

import { LocalStorage } from 'quasar';
import { apiGet } from 'boot/backend';

import router from 'src/router';

async function loadData(data: any, { commit, dispatch }: ActionContext<State, any>) {
    const games = data.games as string[];

    commit('games', games);

    for (const g of games) {
        void dispatch(g + '/init', data[g]);
    }

    await dispatch('user/refresh');
}

export async function boot(context: ActionContext<State, any>) {
    const locale = LocalStorage.getItem('locale');

    if (locale != null) {
        context.commit('locale', locale);
    }

    const localData = LocalStorage.getItem('data');

    if (localData != null) {
        await loadData(localData, context);
    }

    const { data: remoteData } = await apiGet<{ data: any }>('/');

    LocalStorage.set('data', remoteData);

    await loadData(remoteData, context);
}

export function param(context: ActionContext<State, any>, { key, value }: { key: string, value: any }) {
    const route = context.rootState.route as RouteLocationNormalizedLoaded;

    const param = context.state.params?.[key];

    if (param == null || param.readonly) {
        return;
    }

    switch (param.bind) {
    case 'params':
        void router.push({ params: { ...route.params, [key]: value } });
        break;
    case 'query':
        void router.push({ query: { ...route.query, [key]: value } });
        break;
    case 'props':
        context.commit('param', { key, value });
    }
}

export function action(context: ActionContext<State, any>, type: string) {
    const actions = context.state.actions;

    for (const a of actions) {
        if (a.action === type) {
            a.handler();
        }
    }
}
