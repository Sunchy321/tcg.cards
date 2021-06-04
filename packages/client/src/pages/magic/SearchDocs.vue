<template>
    <component :is="component" />
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';

import { useStore } from 'src/store';

import SearchDocsEn from 'src/i18n/en/magic/SearchDocs.vue';
import SearchDocsZhs from 'src/i18n/zhs/magic/SearchDocs.vue';

import { capitalize } from 'lodash';

export default defineComponent({
    components: {
        SearchDocsEn,
        SearchDocsZhs,
    },

    setup() {
        const store = useStore();

        const component = computed(() => 'SearchDocs' + capitalize(store.getters.locale));

        return { component };
    },
});
</script>
