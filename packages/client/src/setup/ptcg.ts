import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { trpc } from 'src/trpc';

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
        const id = await trpc.ptcg.card.random();

        router.push({
            name:   'ptcg/card',
            params: { id },
        });
    };

    return {
        search,
        random,
    };
}
