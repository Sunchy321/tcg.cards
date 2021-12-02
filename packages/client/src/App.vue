<template>
    <div id="q-app">
        <router-view />
    </div>
</template>

<script lang="ts">
import { defineComponent, watch } from 'vue';

import { useQuasar } from 'quasar';
import type { QuasarLanguage } from 'quasar';
import { useRoute } from 'vue-router';
import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';

const quasarLocaleMap: Record<string, string> = {
    en:  'en-US',
    zhs: 'zh-CN',
};

export default defineComponent({
    name: 'App',

    setup() {
        const quasar = useQuasar();
        const route = useRoute();
        const store = useStore();
        const i18n = useI18n();

        store.subscribe(async ({ type, payload }) => {
            const locale = payload as string;

            if (type === 'locale') {
                i18n.locale.value = locale;

                const qLocaleId = quasarLocaleMap[locale]
                    ?? locale.replace(/[A-Z]/, t => `-${t.toLowerCase()}`);

                const qLocale = (
                    await import(`quasar/lang/${qLocaleId}`)
                ) as { default: QuasarLanguage };

                quasar.lang.set(qLocale.default);
            }
        });

        watch(
            () => route.path,
            (path) => {
                if (path === '/') {
                    store.commit('game', null);
                } else {
                    const firstPart = path.split('/').filter(v => v !== '')[0];

                    if ((store.getters.games as string[]).includes(firstPart)) {
                        store.commit('game', firstPart);
                    }
                }
            },
            { immediate: true },
        );

        void store.dispatch('boot');
    },
});
</script>
