import { ComputedRef, computed } from 'vue';
import { RouteMeta, useRoute } from 'vue-router';

import { Game } from '@interface/index';

import { useCore } from 'store/core';

export default function basicSetup(): {
    game: ComputedRef<Game | null>;
    meta: ComputedRef<RouteMeta>;
} {
    const route = useRoute();
    const core = useCore();

    const game = computed(() => core.game);

    const meta = computed(() => route.meta);

    return { game, meta };
}
