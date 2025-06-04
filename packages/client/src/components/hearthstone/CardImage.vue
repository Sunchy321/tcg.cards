<template>
    <q-img
        :src="imageUrl"
        :ratio="512/707"
        native-context-menu
    />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useGame } from 'src/stores/games/hearthstone';

import { Adjustment } from '@interface/hearthstone/format-change';

import { assetBase } from 'boot/server';

const game = useGame();

type PartAdjustment = {
    part:   string;
    status: Adjustment;
};

const props = withDefaults(
    defineProps<{
        id:          string;
        lang?:       string;
        version:     number;
        variant?:    string;
        adjustment?: PartAdjustment[];
    }>(),
    {
        lang:       undefined,
        variant:    'normal',
        adjustment: undefined,
    },
);

const imageUrl = computed(() => {
    const { version } = props;
    const locale = props.lang ?? game.locale;
    const { variant } = props;
    const { id } = props;

    if (props.adjustment == null) {
        return `${assetBase}/hearthstone/card/image/${version}/${locale}/${variant}/${id}.png`;
    } else {
        const adjustment = [...props.adjustment]
            .sort((a, b) => (a.part < b.part ? -1 : a.part > b.part ? 1 : 0))
            .map(v => `${v.part}${v.status[0]}`)
            .join('-');

        return `${assetBase}/hearthstone/card/adjusted/${version}/${locale}/${variant}/${id}-${adjustment}.png`;
    }
});

</script>
