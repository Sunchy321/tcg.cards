<template>
    <div id="q-app">
        <router-view />
    </div>
</template>

<script lang="ts">
import { defineComponent, watch } from 'vue';

import { useRoute } from 'vue-router';
import { useCore } from 'store/core';

export default defineComponent({
    name: 'App',

    setup() {
        const route = useRoute();
        const core = useCore();

        watch(
            () => route.path,
            (path) => {
                if (path === '/') {
                    core.game = null;
                } else {
                    const firstPart = path.split('/').filter(v => v !== '')[0];

                    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                    if (core.isGame(firstPart)) {
                        core.game = firstPart;
                    }
                }
            },
            { immediate: true },
        );

        core.boot();
    },
});
</script>
