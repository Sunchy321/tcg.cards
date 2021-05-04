<template>
    <q-toolbar-title>
        <template v-if="titleType === 'title'" />

        <q-input
            v-if="titleType === 'input'"
            v-model="search"
            class="title-input" dense dark
            standout
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
import { useStore } from 'src/store';

export default defineComponent({
    setup() {
        const route = useRoute();
        const store = useStore();

        const search = computed({
            get() { return store.getters.search; },
            set(newValue: string) { store.commit('search', newValue); },
        });

        const title = computed(() => store.getters.title);
        const titleType = computed(() => store.getters.titleType);

        watch(() => route.query.q, () => {
            const q = route.query.q;

            if (q != null && q !== '') {
                search.value = q as string;
            }
        });

        const keyboardSearch = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                void store.dispatch('action', 'search');
            }
        };

        const mouseSearch = () => store.dispatch('action', 'search');

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
