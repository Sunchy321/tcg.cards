import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { trpc } from 'src/trpc';

export default function yugiohSetup(): {
    search: () => void;
    random: () => Promise<void>;
} {
    const router = useRouter();
    const core = useCore();

    const search = () => {
        const searchText = core.search;

        if (searchText !== '') {
            void router.push({
                name:  'yugioh/search',
                query: { q: searchText },
            });
        }
    };

    const random = async () => {
        const id = await trpc.yugioh.card.random();

        router.push({
            name:   'yugioh/card',
            params: { id },
        });
    };

    return {
        search,
        random,
    };
}
