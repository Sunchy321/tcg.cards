import { useRouter, useRoute } from 'vue-router';
import { useStore } from 'src/store';

import { api } from 'boot/backend';

export default function() {
    const router = useRouter();
    const route = useRoute();
    const store = useStore();

    const search = () => {
        const searchText = store.getters.search;

        if (searchText !== '') {
            void router.push({
                name:  'magic/search',
                query: { q: searchText },
            });
        }
    };

    const random = async () => {
        const { data: id } = await api.get<string>('/magic/card/random', {
            params: { q: store.getters.search },
        });

        if (id !== '') {
            const q = route.query.q;

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
