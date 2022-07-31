import { defineStore } from 'pinia';

import {
    Ref, computed, ref, watch, isRef,
} from 'vue';

import { Game, games as constGames } from '../games';

import useBoot from './boot';
import useLocale from './locale';
import useParams, { Parameter } from './params';
import useAction, { Action } from './action';

export type Value<T> = Ref<T> | T | (() => T);

export type TitleType = 'input' | 'text';

export interface State {
    game: Game | null;
    locale: string;
    search: string;

    title: string;
    titleType: string;
    params: Record<string, any>;
    paramOptions: Record<string, Parameter>;
    actions: Action[];
}

export function valueOf<T>(value: Value<T>): T {
    if (typeof value === 'function') {
        return (value as any)();
    } else if (isRef(value)) {
        return value.value;
    } else {
        return value;
    }
}

export function toRef<T>(value: Value<T>): Ref<T> {
    if (typeof value === 'function') {
        return computed(value as any);
    } else if (isRef(value)) {
        return value;
    } else {
        return computed(() => value);
    }
}

export const useCore = defineStore('core', () => {
    // games
    const game = ref<Game | null>(null);
    const games = computed(() => constGames as Game[]);
    const isGame = (value: string): value is Game => (constGames as readonly string[]).includes(value);

    // locale
    const { locales, locale } = useLocale();

    // page
    const search = ref('');
    const title = ref('');
    const titleType = ref<TitleType>('text');

    const setTitle = (titleOption: Value<string> | undefined) => {
        watch(
            () => valueOf(titleOption ?? ''),
            newValue => { title.value = newValue; },
            { immediate: true },
        );
    };

    watch(title, () => { document.title = title.value; });

    const {
        params, paramOptions, initParams, deinitParams,
    } = useParams();

    const { actions, invokeAction } = useAction();

    return {
        game,
        games,

        locale,
        locales,

        search,
        title,
        titleType,
        setTitle,
        params,
        paramOptions,
        initParams,
        deinitParams,
        actions,

        isGame,
        invokeAction,

        boot: useBoot(locale),
    };
});
