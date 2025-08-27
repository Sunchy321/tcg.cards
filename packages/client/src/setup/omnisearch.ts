import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { trpc } from 'src/trpc';

export default function omnisearchSetup(): {
    search: () => void;
    random: () => Promise<void>;
} {
    const router = useRouter();
    const core = useCore();

    const search = () => {
        const searchText = core.search;

        if (searchText !== '') {
            void router.push({
                name:  'omnisearch',
                query: { q: searchText },
            });
        }
    };

    const random = async () => {
        const data = await trpc.omni.random();

        void router.push({
            name:   `${data.game}/card`,
            params: { id: data.cardId },
        });
    };

    return {
        search,
        random,
    };
}
