<template>
    <div id="q-app">
        <router-view />
    </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';

import { useRoute } from 'vue-router';
import { useFavicon } from '@vueuse/core';
import { useCore } from 'store/core';

import { Game } from '@interface/index';

const route = useRoute();
const favicon = useFavicon();
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

watch(() => core.game, game => {
    if (game == null) {
        favicon.value = '/logo.png';
    } else {
        favicon.value = `/${game}/logo.svg`;
    }
}, { immediate: true });

core.boot();

</script>
