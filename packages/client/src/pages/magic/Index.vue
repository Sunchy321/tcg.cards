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
                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'magic/advanced-search' }"
                    icon="mdi-magnify"
                    :label="$t('magic.ui.advanced-search.$self')"
                    flat
                    :stack="$q.screen.xs"
                />

                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'magic/search-docs' }"
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
                    :to="{ name: 'magic/format', params: { id: 'standard' } }"
                    icon="mdi-text-box-outline"
                    :label="$t('magic.format.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'magic/sets' }"
                    icon="mdi-cards-outline"
                    :label="$t('magic.set.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
            </div>
            <div class="col column">
                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'magic/rule' }"
                    icon="mdi-book-open-variant"
                    :label="$t('magic.cr.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'magic/misc' }"
                    icon="mdi-dots-horizontal-circle"
                    :label="$t('magic.ui.misc.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
            </div>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useCore } from 'store/core';
import { useI18n } from 'vue-i18n';

import magicSetup from 'setup/magic';
import pageSetup from 'setup/page';

import SearchInput from 'components/SearchInput.vue';
import RichText from 'src/components/magic/RichText.vue';

import model from '@search-data/magic/client';

const core = useCore();
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
