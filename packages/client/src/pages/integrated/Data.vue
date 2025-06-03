<template>
    <q-page>
        <page-component v-if="pageComponent != null" />
    </q-page>
</template>

<script setup lang="ts">
import {
    Component, shallowRef, watch, defineAsyncComponent,
} from 'vue';

import pageSetup from 'setup/page';

const components = import.meta.glob<Component>('./data/*.vue');

// keep order
const tabs = [
    'Sync',
];

const { tab } = pageSetup({
    params: {
        tab: {
            type:    'enum',
            bind:    'query',
            inTitle: true,
            values:  tabs,
            label:   v => v,
        },
    },
});

pageSetup({ title: () => `Data - ${tab.value}`, appendParam: true });

const pageComponent = shallowRef<Component>();

watch([tab], () => {
    const filename = `./data/${tab.value}.vue`;

    const component = components[filename];

    if (component == null) {
        pageComponent.value = undefined;

        return;
    }

    pageComponent.value = defineAsyncComponent(components[filename]);
}, { immediate: true });

</script>
