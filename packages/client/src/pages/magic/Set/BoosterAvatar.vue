<template>
    <div class="booster-avatar">
        <div class="avatar" :class="{ single: count == 1 }" :style="avatarStyle">
            <img
                v-for="j in count" :key="j" :src="avatarUrl"
                class="card"
                :class="kebabCase(type)"
            >
        </div>

        <div class="text-center">
            {{ name }}
            <span v-if="count > 1"> x{{ count }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useI18n } from 'vue-i18n';

import { kebabCase } from 'lodash';

const props = defineProps<{
    type:  string;
    count: number;
}>();

const i18n = useI18n();

const name = computed(() => {
    const key = `magic.set.booster.type.${props.type}`;

    if (i18n.te(key)) {
        return i18n.t(key);
    } else if (i18n.te(key, 'en')) {
        return i18n.t(key, 'en');
    } else {
        return props.type;
    }
});

const avatarUrl = computed(() => {
    switch (props.type) {
    case 'uncommon':
    case 'rare':
    case 'rare-mythic':
        return `/magic/card/${kebabCase(props.type)}.svg`;
    default:
        return '/magic/card/default.svg';
    }
});

const avatarStyle = computed(() => ({
    '--card-count':         props.count,
    '--card-width':         '80px',
    '--card-overlap-width': '20px',
}));

</script>

<style lang="sass" scoped>

.booster-avatar
    display: flex
    flex-direction: column
    align-items: center

    margin-bottom: 5px

.avatar
    display: grid

    &.single
        grid-template-columns: var(--card-width)

    &:not(.single)
        grid-template-columns: repeat(calc(var(--card-count) - 1), var(--card-overlap-width)) var(--card-width)

.card
    width: var(--card-width)

</style>
