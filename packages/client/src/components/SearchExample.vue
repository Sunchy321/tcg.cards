<template>
    <div class="example">
        <div class="flex items-center">
            <code class="col-grow">{{ query }}</code>

            <q-btn
                type="a"
                target="_blank"
                :to="link"
                icon="mdi-link"
                flat dense round
            />
        </div>
        <slot />
    </div></template>

<style lang="sass" scoped>
.example
    border: 1px black solid
    border-radius: 10px
</style>

<script lang="ts">
import { defineComponent, computed } from 'vue';

import basicSetup from 'setup/basic';

export default defineComponent({
    props: {
        query: {
            type:     String,
            required: true,
        },
    },

    setup(props) {
        const { game } = basicSetup();

        const link = computed(() => `/${game.value!}/search?q=${props.query}`);

        return { link };
    },
});
</script>
