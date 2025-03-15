<template>
    <render />
</template>

<script setup lang="ts">
import { h } from 'vue';

const props = defineProps<{
    value: string;
}>();

const render = () => {
    const klass = 'lorcana-symbol';

    return h('span', { class: klass }, props.value);
};
</script>

<style lang="sass">
.lorcana-symbol
    font-family: lorcana-symbol
    display: inline-block

    &.cost
        margin-right: 1px

    &.mini
        font-size: 50%
</style>
