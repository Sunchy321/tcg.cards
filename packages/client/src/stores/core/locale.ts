import { LocalStorage, QuasarLanguage, useQuasar } from 'quasar';

import {
    ComputedRef, WritableComputedRef, ref, computed,
} from 'vue';

import { useI18n } from 'vue-i18n';

import i18nData from 'src/i18n';

const quasarLocaleMap: Record<string, string> = {
    en:  'en-US',
    zhs: 'zh-CN',
};

export const localeList = Object.keys(i18nData);

function qLocales() {
    return import.meta.glob('/node_modules/quasar/lang/*');
}

export default function useLocale(): {
    locales: ComputedRef<string[]>;
    locale: WritableComputedRef<string>;
} {
    const quasar = useQuasar();
    const i18n = useI18n();

    const localeState = ref('en');
    const locales = computed(() => localeList);

    const locale = computed({
        get(): string {
            return localeState.value;
        },
        set(newValue: string) {
            (async () => {
                if (localeList.includes(newValue)) {
                    LocalStorage.set('locale', newValue);
                    localeState.value = newValue;

                    i18n.locale.value = newValue;

                    const qLocaleId = quasarLocaleMap[newValue]
                    ?? newValue.replace(/[A-Z]/, t => `-${t.toLowerCase()}`);

                    const qLocaleImport = qLocales()[`/node_modules/quasar/lang/${qLocaleId}.js`];

                    const qLocale = await qLocaleImport() as { default: QuasarLanguage };

                    quasar.lang.set(qLocale.default);
                }
            })();
        },
    });

    return {
        locales,
        locale,
    };
}
