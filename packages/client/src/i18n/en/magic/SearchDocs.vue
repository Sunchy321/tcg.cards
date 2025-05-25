<template>
    <q-page />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import pageSetup from 'setup/page';

// import SearchExample from 'components/SearchExample.vue';
// import RichText from 'components/magic/Text.vue';

export default defineComponent({
    // components: { SearchExample, RichText },

    setup() {
        pageSetup({
            title: 'Search Docs',
        });
    },
});
</script>

<style lang="sass" scoped src="../../search-docs.sass" />
