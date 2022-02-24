<template>
    <q-page>
        <div class="main-input q-ma-xl">
            <q-input v-model="searchText" filled />
        </div>
        <div class="links q-pa-xl q-gutter-md row">
            <div class="col column">
                <!-- <q-btn
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
                /> -->
            </div>
            <div class="col column">
                <!-- <q-btn
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
                /> -->
            </div>
            <div class="col column">
                <q-btn
                    class="link"
                    type="a"
                    to="/hearthstone/log-parse"
                    icon="mdi-text-box-search-outline"
                    :label="$t('hearthstone.ui.log-parse.$self')"
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

import hearthstoneSetup from 'setup/hearthstone';
import pageSetup from 'setup/page';

export default defineComponent({
    name: 'Hearthstone',

    setup() {
        const store = useStore();
        const i18n = useI18n();

        const { random } = hearthstoneSetup();

        pageSetup({
            title:   () => i18n.t('hearthstone.$self'),
            actions: [
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
            searchText,
        };
    },
});
</script>
