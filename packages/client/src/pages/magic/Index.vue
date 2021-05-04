<template>
    <q-page>
        <q-input
            v-model="searchText"
            class="main-input q-ma-xl"
            filled
            @keypress.enter="doSearch"
        >
            <template #append>
                <q-btn
                    icon="mdi-magnify"
                    flat dense round
                    @click="doSearch"
                />
            </template>
        </q-input>
        <div class="links q-pa-xl q-gutter-md row ">
            <div class="col column" />
            <div class="col column">
                <q-btn
                    class="link"
                    flat
                    icon="mdi-text-box-outline"
                    :label="$t('magic.format.$self')"
                    to="/magic/format/standard"
                />
            </div>
            <div class="col column">
                <q-btn
                    class="link"
                    flat
                    icon="mdi-book-open-variant"
                    :label="$t('magic.cr.$self')"
                    to="/magic/cr"
                />
            </div>
            <div class="col column" />
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

        const doSearch = () => {
            store.commit('event', { type: 'search' });
        };

        return {
            searchText, doSearch,
        };
    },

});
</script>
