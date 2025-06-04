import { ComputedRef, computed } from 'vue';
import { RouteMeta, useRoute } from 'vue-router';

import { Game } from 'interface/index';

import { useCore } from 'store/core';
import { User, useUser } from 'store/user';

export default function basicSetup(): {
    game:    ComputedRef<Game | null>;
    user:    ComputedRef<User | null>;
    isAdmin: ComputedRef<boolean>;
    meta:    ComputedRef<RouteMeta>;
} {
    const route = useRoute();
    const core = useCore();
    const userStore = useUser();

    const game = computed(() => core.game);
    const user = computed(() => userStore.user);
    const isAdmin = computed(() => userStore.isAdmin);

    const meta = computed(() => route.meta);

    return {
        game, user, isAdmin, meta,
    };
}
