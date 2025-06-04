import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { apiGet } from 'boot/server';

export default function integratedSetup(): {
    search: () => void;
    random: () => Promise<void>;
} {
    const router = useRouter();
    const core = useCore();

    const search = () => {
        const searchText = core.search;

        if (searchText !== '') {
            void router.push({
                name:  'integrated/search',
                query: { q: searchText },
            });
        }
    };

    const random = async () => {
        const { data } = await apiGet<{ game: string, id: string }>('/integrated/card/random', {
            q: core.search,
        });

        if (data.id !== '') {
            void router.push({
                name:   `${data.game}/card`,
                params: { id: data.id },
            });
        }
    };

    return {
        search,
        random,
    };
}
