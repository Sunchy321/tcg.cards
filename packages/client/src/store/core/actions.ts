/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { ActionContext } from 'vuex';
import { State } from './state';

import { LocalStorage } from 'quasar';
import { apiGet } from 'boot/backend';
import { games, locales } from './getters';

async function loadData(data: any, { dispatch }: ActionContext<State, any>) {
    for (const g of games()) {
        void dispatch(`${g}/init`, data[g]);
    }

    await dispatch('user/refresh');
}

const localeMap: Record<string, string> = {
    'zh-CN': 'zhs',
};

export async function boot(context: ActionContext<State, any>): Promise<void> {
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

export interface Action {
    name: string;
    type?: string;
    fallback?: boolean;
    payload?: any;
}

export function action(context: ActionContext<State, any>, actionInfo: Action): void {
    const {
        name, type = 'default', fallback = true, payload,
    } = actionInfo;

    const { actions } = context.state;

    for (const a of actions) {
        if (a.action === name) {
            const { handler } = a;

            if (typeof handler === 'function') {
                if (type === 'default' || fallback) {
                    handler(payload);
                }
            } else if (handler[type] != null) {
                handler[type](payload);
            } else if (handler.default != null && fallback) {
                handler.default(payload);
            }
        }
    }
}
