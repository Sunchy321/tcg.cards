<template>
    <q-page>
        <page-component v-if="pageComponent != null" />
    </q-page>
</template>

<script setup lang="ts">
import {
    Component, shallowRef, watch, defineAsyncComponent,
} from 'vue';

import { useParam, useTitle } from 'store/core';

const components = import.meta.glob<Component>('./data/*.vue');

// keep order
const tabs = [
    'LorcanaJSON',
    'Image',
    'Editor',
    'Updation',
    'Duplicate',
    'Set',
    'Format',
    'Announcement',
    'Legality',
    // 'CR',
];

const tab = useParam('tab', {
    type:    'enum',
    bind:    'query',
    inTitle: true,
    values:  tabs,
    label:   v => v,
});

useTitle(() => `Data - ${tab.value}`);

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
