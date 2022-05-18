/* eslint-disable prefer-destructuring */
import { defineStore } from 'pinia';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUser } from './user';

import {
    Action, ParamObject, TitleType, getDefault,
} from 'setup/page';
import { Game, games as constGames, gameStores } from './games';

import { QuasarLanguage, LocalStorage, useQuasar } from 'quasar';
import { computed, ref, watch } from 'vue';
import { mapValues, omit } from 'lodash';
import { apiGet } from 'src/boot/backend';

import i18nData from 'src/i18n';

export interface State {
    game: Game | null;
    locale: string;
    search: string;

    title: string;
    titleType: string;
    params: Record<any, ParamObject<any, boolean>>;
    actions: Action[];
}

export interface ActionInfo {
    name: string;
    type?: string;
    fallback?: boolean;
    payload?: any;
}

const localeMap: Record<string, string> = {
    'zh-CN': 'zhs',
};

const quasarLocaleMap: Record<string, string> = {
    en:  'en-US',
    zhs: 'zh-CN',
};

const localeList = Object.keys(i18nData);

async function loadData(data: any) {
    for (const g of Object.keys(gameStores)) {
        const store = (gameStores as any)[g]();

        store.init(data[g]);
    }

    const userStore = useUser();

    userStore.refresh();
}

function qLocales() {
    return import.meta.glob('/node_modules/quasar/lang/*');
}

export const useCore = defineStore('core', () => {
    const quasar = useQuasar();
    const router = useRouter();
    const route = useRoute();
    const i18n = useI18n();

    // games
    const game = ref<Game | null>(null);
    const games = computed(() => constGames as Game[]);
    const isGame = (value: string): value is Game => (constGames as readonly string[]).includes(value);

    // locale
    const localeState = ref('en');
    const locales = computed(() => localeList);

    const locale = computed({
        get(): string {
            return localeState.value;
        },
        async set(newValue: string) {
            if (localeList.includes(newValue)) {
                LocalStorage.set('locale', newValue);
                localeState.value = newValue;

                i18n.locale.value = newValue;

                const qLocaleId = quasarLocaleMap[newValue]
                    ?? newValue.replace(/[A-Z]/, t => `-${t.toLowerCase()}`);

                const qLocaleImport = qLocales()[`/node_modules/quasar/lang/${qLocaleId}.mjs`];

                const qLocale = await qLocaleImport() as { default: QuasarLanguage };

                quasar.lang.set(qLocale.default);
            }
        },
    });

    // page
    const search = ref('');
    const title = ref('');
    const titleType = ref<TitleType>('text');
    const paramState = ref<Record<any, ParamObject<any, boolean>>>({});
    const actions = ref<Action[]>([]);

    watch(title, () => { document.title = title.value; });

    const paramValues = computed(() => mapValues(paramState.value, (param, key) => {
        const defaultValue = getDefault(param);

        const realKey = param.key ?? key;

        switch (param.bind) {
        case 'params': {
            const result = route.params[realKey] as string;

            if (param.type === 'boolean') {
                return result !== undefined;
            }

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

            if (param.type === 'boolean') {
                return result !== undefined;
            }

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
    }));

    const params = computed((): Record<string, ParamObject<any, boolean> & { value: any }> => {
        const values = paramValues.value;

        return mapValues(paramState.value, (param, key) => ({
            ...param,
            value: values[key],
        }));
    });

    const setParam = (key: string, value: any) => {
        const paramValue = paramState.value?.[key];

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
            if (paramValue.type === 'boolean') {
                if (value === true) {
                    void router.push({
                        params: { ...route.params, [realKey]: null },
                        query:  route.query,
                    });
                } else {
                    void router.push({
                        params: omit(route.params, [realKey]),
                        query:  route.query,
                    });
                }
            } else {
                void router.push({
                    params: { ...route.params, [realKey]: value ?? undefined },
                    query:  route.query,
                });
            }
            break;
        case 'query':
            if (paramValue.type === 'boolean') {
                if (value === true) {
                    void router.push({
                        query: { ...route.query, [realKey]: null },
                    });
                } else {
                    void router.push({
                        query: omit(route.query, [realKey]),
                    });
                }
            } else {
                void router.push({
                    query: { ...route.query, [realKey]: value ?? undefined },
                });
            }
            break;
        case 'props':
            paramState.value[key].value = value;
            break;
        default:
        }
    };

    const invokeAction = (actionInfo: ActionInfo) => {
        const {
            name, type = 'default', fallback = true, payload,
        } = actionInfo;

        for (const a of actions.value) {
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
    };

    // boot
    const boot = async () => {
        const theLocale = LocalStorage.getItem('locale') as string;

        if (theLocale != null) {
            locale.value = theLocale;
        } else {
            const navLang = navigator.language;

            if (localeMap[navLang] != null) {
                locale.value = localeMap[navLang];
            } else if (localeList.includes(navLang.split('-')[0])) {
                locale.value = navLang.split('-')[0];
            }
        }

        const localData = LocalStorage.getItem('data');

        if (localData != null) {
            await loadData(localData);
        }

        const { data: remoteData } = await apiGet<{ data: any }>('/');

        LocalStorage.set('data', remoteData);

        await loadData(remoteData);
    };

    return {
        game,
        games,

        locale,
        locales,

        search,
        title,
        titleType,
        paramState,
        paramValues,
        params,
        actions,

        isGame,
        setParam,
        invokeAction,

        boot,
    };
});
