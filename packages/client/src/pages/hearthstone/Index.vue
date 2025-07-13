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
                <rich-text>{{ explained.text }}</rich-text>
            </template>
            <template #error>
                <rich-text>{{ explained.text }}</rich-text>
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
import { useCore, useTitle } from 'store/core';

import hearthstoneSetup from 'setup/hearthstone';

import SearchInput from 'components/SearchInput.vue';

import model from '@search-data/hearthstone/client';

const core = useCore();
const i18n = useI18n();

const { random, search } = hearthstoneSetup();

useTitle(() => i18n.t('hearthstone.$self'));

core.actions = [
    {
        action:  'random',
        icon:    'mdi-shuffle-variant',
        handler: random,
    },
];

const searchText = computed({
    get() { return core.search; },
    set(newValue: string) { core.search = newValue; },
});

const explained = computed(() => model.explain(searchText.value, (key: string, named) => {
    let realKey;

    if (key.startsWith('$.')) {
        realKey = `hearthstone.search.${key.slice(2)}`;
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
