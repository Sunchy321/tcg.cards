import { ComputedRef, computed } from 'vue';
import { RouteMeta, useRoute } from 'vue-router';

import { useCore } from 'store/core';
import { User, useUser } from 'store/user';
import { Game } from 'store/games';

export default function basicSetup(): {
    games: ComputedRef<Game[]>;
    game: ComputedRef<Game | null>;
    user: ComputedRef<User | null>;
    isAdmin: ComputedRef<boolean>;
    meta: ComputedRef<RouteMeta>;
} {
    const route = useRoute();
    const core = useCore();
    const userStore = useUser();

    const games = computed(() => core.games);
    const game = computed(() => core.game);
    const user = computed(() => userStore.user);
    const isAdmin = computed(() => userStore.isAdmin);

    const meta = computed(() => route.meta);

    return {
        games, game, user, isAdmin, meta,
    };
}
