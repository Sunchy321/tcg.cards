<template>
    <div id="q-app">
        <router-view />
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { QuasarLanguage, useQuasar } from 'quasar';
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
        const store = useStore();
        const i18n = useI18n();

        store.subscribe(async ({ type, payload }) => {
            const locale = payload as string;

            if (type === 'locale') {
                i18n.locale.value = locale;

                const qLocaleId = quasarLocaleMap[locale] ??
                    locale.replace(/[A-Z]/, t => '-' + t.toLowerCase());

                const qLocale = (
                    await import('quasar/lang/' + qLocaleId)
                ) as { default: QuasarLanguage };

                quasar.lang.set(qLocale.default);
            }
        });

        void store.dispatch('boot');
    },
});
</script>
