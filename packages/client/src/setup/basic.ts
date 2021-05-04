import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { useStore } from 'src/store';

export default function() {
    const route = useRoute();
    const store = useStore();

    const games = computed(() => store.state.games ?? []);

    const game = computed(() => {
        const path = route.path;
        const firstPart = path.split('/').filter(v => v !== '')[0];
        return games.value.includes(firstPart)
            ? firstPart as 'magic' | 'hearthstone'
            : null;
    });

    const user = computed(() => store.getters['user/user']);
    const isAdmin = computed(() => store.getters['user/isAdmin']);

    const meta = computed(() => route.meta);

    return { games, game, user, isAdmin, meta };
}
