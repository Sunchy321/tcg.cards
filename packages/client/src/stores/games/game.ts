import {
    GameOption, GameOptions, GameStoreDefinition,
} from './interface';

import { LocalStorage } from 'quasar';

import { defineStore } from 'pinia';
import {
    Ref, computed, ref, watch,
} from 'vue';

import { useCore } from '../core';

import { Game } from 'interface/index';
import data from 'static/index';

function defaultValue(option: GameOption) {
    if (option.type === 'enum' && option.default != null) {
        return option.default;
    } else { // option.type === 'number';
        return 0;
    }
}

export function defineGameStore<
    G extends Game, S,
>(game: G, options: GameOptions<S>): GameStoreDefinition<G, S> {
    return defineStore(game, () => {
        const core = useCore();

        const locale = ref('en');

        const locales = computed(() => data[game].locales);

        const states = {} as { [K in keyof S]?: Ref<S[K]> };

        watch(locale, () => {
            LocalStorage.set(`${game}/locale`, locale.value);
        });

        for (const k of Object.keys(options)) {
            (states as any)[k] = ref(defaultValue((options as any)[k]));

            watch((states as any)[k], () => {
                LocalStorage.set(`${game}/${k}`, (states as any)[k].value);
            });
        }

        const init = () => {
            const gameLocale = LocalStorage.getItem(`${game}/locale`) as string;

            if (gameLocale != null) {
                locale.value = gameLocale;
            } else {
                const appLocale = core.locale;

                if (locales.value.includes(appLocale)) {
                    locale.value = appLocale;
                } else {
                    locale.value = locales.value[0] ?? 'en';
                }
            }

            for (const k of Object.keys(options)) {
                const value = LocalStorage.getItem(`${game}/${k}`);

                if (value != null) {
                    (states as any)[k].value = value;
                }
            }
        };

        return {
            ...data[game],

            locale,
            ...states as { [K in keyof S]: Ref<S[K]> },

            init,
        };
    }) as unknown as GameStoreDefinition<G, S>;
}
