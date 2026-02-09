<template>
    <q-page>
        <search-input
            v-model="searchText"
            class="main-input q-ma-xl"
            filled clearable
            game="lorcana"
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
                    v-if="isLoggedIn"
                    class="link"
                    type="a"
                    :to="{ name: 'lorcana/chat' }"
                    icon="mdi-robot"
                    :label="$t('ui.ai.chat')"
                    flat
                    :stack="$q.screen.xs"
                />
                <!-- <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'lorcana/advanced-search' }"
                    icon="mdi-magnify"
                    :label="$t('magic.ui.advanced-search.$self')"
                    flat
                    :stack="$q.screen.xs"
                />

                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'lorcana/search-docs' }"
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
                    :to="{ name: 'lorcana/format', params: { id: 'core' } }"
                    icon="mdi-text-box-outline"
                    :label="$t('lorcana.format.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'lorcana/sets' }"
                    icon="mdi-cards-outline"
                    :label="$t('lorcana.set.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
            </div>
            <div class="col column">
                <!-- <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'lorcana/rule' }"
                    icon="mdi-book-open-variant"
                    :label="$t('lorcana.rule.$self')"
                    flat
                    :stack="$q.screen.xs"
                />
                <q-btn
                    class="link"
                    type="a"
                    :to="{ name: 'lorcana/misc' }"
                    icon="mdi-dots-horizontal-circle"
                    :label="$t('lorcana.ui.misc.$self')"
                    flat
                    :stack="$q.screen.xs"
                /> -->
            </div>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useCore, useTitle } from 'store/core';
import { useI18n } from 'vue-i18n';

import lorcanaSetup from 'setup/lorcana';

import SearchInput from 'components/SearchInput.vue';
import RichText from 'src/components/lorcana/RichText.vue';

import { explain as model } from 'src/search/data/lorcana';
import { auth } from 'src/auth';

const core = useCore();
const i18n = useI18n();
const session = auth.useSession();

const isLoggedIn = computed(() => session.value?.data?.user != null);

const { search, random } = lorcanaSetup();

useTitle (() => i18n.t('lorcana.$self'));

core.actions = [
    {
        action:  'search',
        handler: search,
    },
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
        realKey = `magic.search.${key.slice(2)}`;
    } else {
        realKey = `search.${key}`;
    }

    console.log(key, named);

    if (named != null) {
        return i18n.t(realKey, named);
    } else {
        return i18n.t(realKey);
    }
}));

</script>
