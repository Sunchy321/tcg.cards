import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { trpc } from 'src/trpc';

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
        const cardId = await trpc.magic.card.random();

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
