import { useRouter, useRoute } from 'vue-router';
import { useCore } from 'store/core';

import { api } from 'boot/backend';

export default function magicSetup(): {
    search: () => void;
    random: () => Promise<void>;
} {
    const router = useRouter();
    const route = useRoute();
    const core = useCore();

    const search = () => {
        const searchText = core.search;

        if (searchText !== '') {
            void router.push({
                name:  'magic/search',
                query: { q: searchText },
            });
        }
    };

    const random = async () => {
        const { data: id } = await api.get<string>('/magic/card/random', {
            params: { q: core.search },
        });

        if (id !== '') {
            const { q } = route.query;

            void router.push({
                name:   'magic/card',
                params: { id },
                query:  { q: q === '' ? undefined : q },
            });
        }
    };

    return {
        search,
        random,
    };
}
