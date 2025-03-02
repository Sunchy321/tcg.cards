<template>
    <div class="card-image">
        <div class="image">
            <q-img
                :src="imageUrl"
                :ratio="512/707"
                native-context-menu
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useHearthstone } from 'src/stores/games/hearthstone';

import { imageBase, assetBase } from 'boot/server';

const hearthstone = useHearthstone();

const props = withDefaults(
    defineProps<{
        id: string;
        lang?: string;
        version?: number;
        variant?: string;
    }>(),
    {
        lang:    undefined,
        version: undefined,
        variant: 'normal',
    },
);

const imageUrl = computed(() => `${assetBase}/hearthstone/card/image/${props.version}/${props.variant}/${props.id}.png`);

</script>

<style lang="sass" scoped>
.card-image
    position: relative
    padding-bottom: calc(100% / (512/707))
    perspective: 1000px

.image
    position: absolute

    top: 0
    left: 0
    bottom: 0
    right: 0

    transition: transform 0.5s
</style>
