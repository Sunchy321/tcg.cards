import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { apiGet } from 'boot/server';

export default function lorcanaSetup(): {
    search: () => void;
    random: () => Promise<void>;
} {
    const router = useRouter();
    const core = useCore();

    const search = () => {
        const searchText = core.search;

        if (searchText !== '') {
            void router.push({
                name:  'ptcg/search',
                query: { q: searchText },
            });
        }
    };

    const random = async () => {
        const { data: id } = await apiGet<string>('/ptcg/card/random', {
            q: core.search,
        });

        if (id !== '') {
            void router.push({
                name:   'ptcg/card',
                params: { id },
            });
        }
    };

    return {
        search,
        random,
    };
}
