<template>
    <component :is="component" />
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';

import { useCore } from 'store/core';

import SearchDocsEn from 'src/i18n/en/magic/SearchDocs.vue';
import SearchDocsZhs from 'src/i18n/zhs/magic/SearchDocs.vue';

import { capitalize } from 'lodash';

export default defineComponent({
    components: {
        SearchDocsEn,
        SearchDocsZhs,
    },

    setup() {
        const core = useCore();

        const component = computed(() => `SearchDocs${capitalize(core.locale)}`);

        return { component };
    },
});
</script>
