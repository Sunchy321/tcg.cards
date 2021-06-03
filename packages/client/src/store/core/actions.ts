/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ActionContext } from 'vuex';
import { State } from './state';

import { LocalStorage } from 'quasar';
import { apiGet } from 'boot/backend';
import { locales } from './getters';

async function loadData(data: any, { commit, dispatch }: ActionContext<State, any>) {
    const games = data.games as string[];

    commit('games', games);

    for (const g of games) {
        void dispatch(g + '/init', data[g]);
    }

    await dispatch('user/refresh');
}

const localeMap: Record<string, string> = {
    'zh-CN': 'zhs',
};

export async function boot(context: ActionContext<State, any>) {
    const locale = LocalStorage.getItem('locale');

    if (locale != null) {
        context.commit('locale', locale);
    } else {
        const navLang = navigator.language;

        if (localeMap[navLang] != null) {
            context.commit('locale', localeMap[navLang]);
        } else if (locales().includes(navLang.split('-')[0])) {
            context.commit('locale', navLang.split('-')[0]);
        }
    }

    const localData = LocalStorage.getItem('data');

    if (localData != null) {
        await loadData(localData, context);
    }

    const { data: remoteData } = await apiGet<{ data: any }>('/');

    LocalStorage.set('data', remoteData);

    await loadData(remoteData, context);
}

export function action(context: ActionContext<State, any>, type: string) {
    const actions = context.state.actions;

    for (const a of actions) {
        if (a.action === type) {
            a.handler();
        }
    }
}
