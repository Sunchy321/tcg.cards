import { useRouter, useRoute } from 'vue-router';

import { api } from 'boot/backend';

export default function() {
    const router = useRouter();
    const route = useRoute();

    const random = async () => {
        const { data: id } = await api.get<string>('/hearthstone/card/random', {
            // params: { q: store.getters.search },
        });

        if (id !== '') {
            const q = route.query.q;

            void router.push({
                name:   'hearthstone/card',
                params: { id },
                query:  { q: q === '' ? undefined : q },
            });
        }
    };

    return {
        random,
    };
}
