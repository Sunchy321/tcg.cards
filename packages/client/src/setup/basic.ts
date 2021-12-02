import { ComputedRef, computed } from 'vue';
import { RouteMeta, useRoute } from 'vue-router';

import { useStore } from 'src/store';
import { User } from 'src/store/user/state';
import { Game } from 'src/store/games';

export default function basicSetup(): {
    games: ComputedRef<Game[]>;
    game: ComputedRef<Game | null>;
    user: ComputedRef<User | null>;
    isAdmin: ComputedRef<boolean>;
    meta: ComputedRef<RouteMeta>;
} {
    const route = useRoute();
    const store = useStore();

    const games = computed(() => store.getters.games);
    const game = computed(() => store.state.game);
    const user = computed(() => store.getters['user/user']);
    const isAdmin = computed(() => store.getters['user/isAdmin']);

    const meta = computed(() => route.meta);

    return {
        games, game, user, isAdmin, meta,
    };
}
