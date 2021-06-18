<template>
    <q-page>
        <q-input
            v-model="searchText"
            class="main-input q-ma-xl"
            filled clearable
            @keypress.enter="search"
        >
            <template #append>
                <q-btn
                    icon="mdi-magnify"
                    flat dense round
                    @click="search"
                />
            </template>
        </q-input>
        <div class="links q-pa-xl q-gutter-md row ">
            <div class="col column">
                <q-btn
                    class="link"
                    type="a"
                    to="/magic/advanced-search"
                    icon="mdi-magnify"
                    :label="$t('magic.ui.advanced-search.$self')"
                    flat
                    :stack="$q.screen.xs"
                />

                <q-btn
                    class="link"
                    type="a"
                    to="/magic/search-docs"
                    icon="mdi-information"
                    :label="$t('magic.ui.search-docs.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
            </div>
            <div class="col column">
                <q-btn
                    class="link"
                    type="a"
                    to="/magic/format"
                    icon="mdi-text-box-outline"
                    :label="$t('magic.ui.format.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
                <q-btn
                    class="link"
                    type="a"
                    to="/magic/set"
                    icon="mdi-cards-outline"
                    :label="$t('magic.ui.set.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
            </div>
            <div class="col column">
                <q-btn
                    class="link"
                    type="a"
                    to="/magic/cr"
                    icon="mdi-book-open-variant"
                    :label="$t('magic.cr.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
            </div>
        </div>
    </q-page>
</template>

<script lang="ts">
import { defineComponent, computed } from 'vue';

import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';

import magicSetup from 'setup/magic';
import pageSetup from 'setup/page';

export default defineComponent({
    setup() {
        const store = useStore();
        const i18n = useI18n();

        const { search, random } = magicSetup();

        pageSetup({
            title:   () => i18n.t('magic.$self'),
            actions: [
                {
                    action:  'search',
                    handler: search,
                },
                {
                    action:  'random',
                    icon:    'mdi-shuffle-variant',
                    handler: random,
                },
            ],
        });

        const searchText = computed({
            get() { return store.getters.search; },
            set(newValue: string) { store.commit('search', newValue); },
        });

        return {
            searchText, search,
        };
    },

});
</script>
