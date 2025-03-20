<template>
    <q-page />
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import pageSetup from 'setup/page';

// import SearchExample from 'components/SearchExample.vue';
// import MagicText from 'components/magic/Text.vue';

export default defineComponent({
    // components: { SearchExample, MagicText },

    setup() {
        pageSetup({
            title: 'Search Docs',
        });
    },
});
</script>

<style lang="sass" scoped src="../../search-docs.sass" />
