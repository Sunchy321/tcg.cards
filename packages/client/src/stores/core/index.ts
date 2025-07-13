import { defineStore } from 'pinia';

import { Ref, MaybeRefOrGetter, computed, ref, watch, toRef, shallowReactive } from 'vue';
import { useTitle as useVueUseTitle } from '@vueuse/core';

import { Game, games as constGames } from '@interface/index';

import useBoot from './boot';
import useLocale from './locale';
import { Action, setupAction } from './action';

import { getValue, Parameter, setValue } from './params';

export type { Parameter, ParamOption } from './params';
export { useParam, clearParam } from './params';

export { useAction } from './action';

export type TitleType = 'input' | 'text';

export interface State {
    game:   Game | null;
    locale: string;
    search: string;

    title:     string;
    titleType: string;
    actions:   Action[];
}

export const useCore = defineStore('core', () => {
    // games
    const game = ref<Game | null>(null);
    const isGame = (value: string): value is Game => (constGames as readonly string[]).includes(value);

    // locale
    const { locales, locale } = useLocale();

    // page
    const innerSearch = ref('');
    const title = ref('');
    const titleType = ref<TitleType>('text');

    const search: Ref<string> = computed({
        get() { return innerSearch.value; },
        set(newValue: string) { innerSearch.value = newValue ?? ''; },
    });

    watch(title, () => { document.title = title.value; });

    // params
    const params = shallowReactive<Record<string, Parameter>>({});

    const getParam = <T>(name: string): T => {
        return getValue(name);
    };

    const setParam = (name: string, value: any) => {
        setValue(name, value);
    };

    // actions
    const { actions, invokeAction } = setupAction();

    return {
        game,

        locale,
        locales,

        search,
        title,
        titleType,

        params,
        getParam,
        setParam,

        actions,

        isGame,
        invokeAction,

        boot: useBoot(locale),
    };
});

export function useTitle(newTitle: MaybeRefOrGetter<string>, titleType?: TitleType) {
    const core = useCore();

    const title = toRef(newTitle);

    useVueUseTitle(title);

    watch(title, newValue => { core.title = newValue; }, { immediate: true });

    core.titleType = titleType ?? 'text';
}
