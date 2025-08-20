import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { trpc } from 'src/trpc';

export default function hearthstoneSetup(): {
    search: () => void;
    random: () => Promise<void>;
} {
    const router = useRouter();
    const core = useCore();

    const search = () => {
        const searchText = core.search;

        if (searchText !== '') {
            void router.push({
                name:  'hearthstone/search',
                query: { q: searchText },
            });
        }
    };

    const random = async () => {
        const value = await trpc.hearthstone.card.random();

        if (value != null) {
            void router.push({
                name:   'hearthstone/card',
                params: { id: value },
            });
        }
    };

    return {
        search,
        random,
    };
}
