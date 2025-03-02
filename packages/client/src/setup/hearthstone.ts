import { useRouter } from 'vue-router';
import { useCore } from 'store/core';

import { api } from 'boot/server';

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
        const { data: id } = await api.get<string>('/hearthstone/entity/random', {
            params: { q: core.search },
        });

        if (id !== '') {
            void router.push({
                name:   'hearthstone/entity',
                params: { id },
            });
        }
    };

    return {
        search,
        random,
    };
}
