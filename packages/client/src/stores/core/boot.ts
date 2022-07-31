import { Ref } from 'vue';
import { LocalStorage } from 'quasar';

import { useUser } from '../user';

import { gameStores } from '../games';

import { apiGet } from 'src/boot/backend';

import { localeList } from './locale';

const localeMap: Record<string, string> = {
    'zh-CN': 'zhs',
};

async function loadData(data: any) {
    for (const g of Object.keys(gameStores)) {
        const store = (gameStores as any)[g]();

        store.init(data[g]);
    }

    const userStore = useUser();

    userStore.refresh();
}

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

        const localData = LocalStorage.getItem('data');

        if (localData != null) {
            await loadData(localData);
        }

        const { data: remoteData } = await apiGet<{ data: any }>('/');

        LocalStorage.set('data', remoteData);

        await loadData(remoteData);
    };
}
