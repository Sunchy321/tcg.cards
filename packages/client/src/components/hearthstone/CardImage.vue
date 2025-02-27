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

import { imageBase } from 'boot/backend';

const hearthstone = useHearthstone();

const props = withDefaults(
    defineProps<{
        id: string;
        lang?: string;
        version?: number;
        variant: string;
    }>(),
    {
        lang:    undefined,
        version: undefined,
        variant: 'normal',
    },
);

const imageUrl = computed(() => {
    const url = new URL('/hearthstone/entity', imageBase);

    const params: any = {
        id:   props.id,
        lang: props.lang ?? hearthstone.locale,
    };

    if (props.version !== null) {
        params.version = props.version;
    }

    params.variant = props.variant;

    url.search = new URLSearchParams(params).toString();

    return url.toString();
});

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
