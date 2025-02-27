<template>
    <q-page>
        <search-input
            v-model="searchText"
            class="main-input q-ma-xl"
            filled clearable
            :error="explained.type === 'error'"
            @keypress.enter="search"
        >
            <template #append>
                <q-btn
                    icon="mdi-magnify"
                    flat dense round
                    @click="search"
                />
            </template>
            <template #hint>
                <magic-text>{{ explained.text }}</magic-text>
            </template>
            <template #error>
                <magic-text>{{ explained.text }}</magic-text>
            </template>
        </search-input>
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
                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'hearthstone/format', params: { id: 'standard' } }"
                    icon="mdi-text-box-outline"
                    :label="$t('hearthstone.format.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
                <!-- <q-btn
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
                <!-- <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'hearthstone/log-parse' }"
                    icon="mdi-text-box-search-outline"
                    :label="$t('hearthstone.ui.log-parse.$self')"
                    flat
                    :stack="$q.screen.xs"
                /> -->
                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'hearthstone/misc' }"
                    icon="mdi-dots-horizontal-circle"
                    :label="$t('hearthstone.ui.misc.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
            </div>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useI18n } from 'vue-i18n';
import { useCore } from 'store/core';

import hearthstoneSetup from 'setup/hearthstone';
import pageSetup from 'setup/page';

import SearchInput from 'components/SearchInput.vue';

import model from 'searcher-data/hearthstone/client';

const core = useCore();
const i18n = useI18n();

const { random, search } = hearthstoneSetup();

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
    get() { return core.search; },
    set(newValue: string) { core.search = newValue; },
});

const explained = computed(() => model.explain(searchText.value, (key: string, named) => {
    let realKey;

    if (key.startsWith('$.')) {
        realKey = `magic.search.${key.slice(2)}`;
    } else {
        realKey = `search.${key}`;
    }

    if (named != null) {
        return i18n.t(realKey, named);
    } else {
        return i18n.t(realKey);
    }
}));

</script>
