<template>
    <q-page>
        <div class="controller flex items-center shadow-4 q-px-md">
            <q-icon v-show="searching" class="q-mr-sm" name="mdi-autorenew mdi-spin" size="sm" />

            <div>
                <rich-text>{{ explained.text }}</rich-text>
            </div>

            <q-space />

            <span v-if="data != null" class="code q-mr-md">{{ total }}</span>

            <q-pagination
                :model-value="page"
                class="code"
                :max="pageCount"
                :input="true"
                @update:model-value="changePage"
            />
        </div>
        <div class="result q-py-md">
            <grid
                v-slot="{ cardId, version }"
                :value="cards" :item-width="200" item-key="cardId"
                item-class="q-pb-sm"
            >
                <router-link
                    :key="cardId"
                    :to="cardLink(cardId, version)"
                    target="_blank"
                >
                    <card-image
                        :id="cardId"
                        :version="Math.min(...version)"
                    />
                </router-link>
            </grid>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useCore, useTitle, useParam } from 'store/core';
import { useGame } from 'store/games/hearthstone';

import hearthstoneSetup from 'setup/hearthstone';

import Grid from 'components/Grid.vue';
import CardImage from 'components/hearthstone/CardImage.vue';
import RichText from 'src/components/hearthstone/RichText.vue';

import { SearchResult } from '@model/hearthstone/schema/search';

import { last } from 'lodash';

import model from '@search-data/hearthstone/client';

import { getValue, trpc } from 'src/hono';

const core = useCore();
const i18n = useI18n();
const router = useRouter();
const game = useGame();

const { search } = hearthstoneSetup();

const data = ref<SearchResult>();
const searching = ref(false);

useTitle(() => i18n.t('ui.search'));

core.titleType = 'input';

const q = useParam('q', {
    type:     'string',
    bind:     'query',
    readonly: true,
});

const page = useParam('page', {
    type:    'number',
    bind:    'query',
    default: 1,
});

const pageSize = useParam('pageSize', {
    type:    'number',
    bind:    'query',
    default: 100,
});

core.actions = [
    {
        action:  'search',
        handler: search,
    },
];

const searchText = computed({
    get() { return core.search; },
    set(newValue: string) { (core as any).search = newValue; },
});

const explained = computed(() => model.explain(q.value, (key: string, named) => {
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

const cards = computed(() => data.value?.result?.result ?? []);
const total = computed(() => data.value?.result?.total ?? 0);

const pageCount = computed(() => Math.ceil(total.value / pageSize.value));

const doSearch = async () => {
    if (q.value == null || q.value === '') {
        return;
    }

    searchText.value = q.value;

    searching.value = true;

    const value = await getValue(trpc.hearthstone.search, {
        q:        q.value,
        lang:     game.locale,
        page:     page.value.toString(),
        pageSize: pageSize.value.toString(),
    });

    if (value?.text === q.value) {
        data.value = value as any;

        searching.value = false;
    }
};

const changePage = (newPage: number) => {
    if (page.value !== newPage) {
        page.value = newPage;
    }
};

const cardLink = (cardId: string, version?: number[]) => router.resolve({
    name:   'hearthstone/card',
    params: { id: cardId },
    query:  version != null ? { version: last(version) } : {},
});

watch([q, page, pageSize], doSearch, { immediate: true });
</script>

<style lang="sass" scoped>
.controller
    height: 50px

    position: fixed
    top: 50px
    left: 0
    right: 0

    background-color: lighten($primary, 20%)

    z-index: 10

    &:deep(*)
        color: white !important

.result
    margin-top: 50px
    margin-left: 50px
    margin-right: 50px

.card-panel
    justify-content: center !important
</style>
