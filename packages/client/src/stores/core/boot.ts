import { Ref } from 'vue';
import { LocalStorage } from 'quasar';

import { gameStores } from '../games';

import { localeList } from './locale';

const localeMap: Record<string, string> = {
    'zh-CN': 'zhs',
};

export default function useBoot(locale: Ref<string>) {
    return async (): Promise<void> => {
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

        for (const g of Object.keys(gameStores)) {
            const store = (gameStores as any)[g]();

            store.init();
        }
    };
}
