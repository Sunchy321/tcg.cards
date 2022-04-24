<template>
    <q-toolbar-title>
        <template v-if="titleType === 'title'" />

        <q-input
            v-if="titleType === 'input'"
            v-model="search"
            class="title-input"
            dense dark standout
            clearable
            @keypress="keyboardSearch"
        >
            <template #append>
                <q-btn
                    icon="mdi-magnify"
                    flat dense round
                    @click="mouseSearch"
                />
            </template>
        </q-input>

        <div v-if="titleType === 'text'">{{ title }}</div>
    </q-toolbar-title>
</template>

<style lang="sass">
.title-input
    transition: 0.5s
</style>

<script lang="ts">
import { defineComponent, computed, watch } from 'vue';

import { useRoute } from 'vue-router';
import { useCore } from 'store/core';

export default defineComponent({
    setup() {
        const route = useRoute();
        const core = useCore();

        const search = computed({
            get() { return core.search; },
            set(newValue: string) { core.search = newValue; },
        });

        const title = computed(() => core.title);
        const titleType = computed(() => core.titleType);

        watch(() => route.query.q, () => {
            const { q } = route.query;

            if (q != null && q !== '') {
                search.value = q as string;
            }
        });

        const keyboardSearch = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                core.invokeAction({ name: 'search' });
            }
        };

        const mouseSearch = async () => { core.invokeAction({ name: 'search' }); };

        return {
            search,
            title,
            titleType,
            keyboardSearch,
            mouseSearch,
        };
    },
});
</script>
