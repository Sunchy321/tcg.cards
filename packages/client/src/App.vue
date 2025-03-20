<template>
    <div id="q-app">
        <router-view />
    </div>
</template>

<script lang="ts">
import { defineComponent, watch } from 'vue';

import { useRoute } from 'vue-router';
import { useCore } from 'store/core';

import { Game } from 'static/index';

export default defineComponent({
    name: 'App',

    setup() {
        const route = useRoute();
        const core = useCore();

        watch(
            () => route.name?.toString(),
            name => {
                if (name == null || name === '') {
                    core.game = null;
                } else if (name.startsWith('setting')) {
                    const game = name.split('/')[1];

                    if (core.isGame(game)) {
                        core.game = game as Game;
                    } else {
                        core.game = null;
                    }
                } else {
                    const firstPart = name.split('/').filter(v => v !== '')[0];

                    if (core.isGame(firstPart)) {
                        core.game = firstPart;
                    } else {
                        core.game = null;
                    }
                }
            },
            { immediate: true },
        );

        core.boot();
    },
});
</script>
