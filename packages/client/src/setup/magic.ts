import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { getValue, trpc } from 'src/hono';

export default function magicSetup(): {
    search: () => void;
    random: () => Promise<void>;
} {
    const router = useRouter();
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
        const cardId = await getValue(trpc.magic.card.random, {});

        router.push({
            name:   'magic/card',
            params: { id: cardId },
        });
    };

    return {
        search,
        random,
    };
}
