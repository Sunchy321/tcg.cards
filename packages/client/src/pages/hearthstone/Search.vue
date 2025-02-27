<template>
    <q-page>
        <div class="controller flex items-center shadow-4 q-px-md">
            <q-icon v-show="searching" class="q-mr-sm" name="mdi-autorenew mdi-spin" size="sm" />

            <div>
                <hearthstone-text>{{ explained.text }}</hearthstone-text>
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
                v-slot="{ entityId, version }"
                :value="cards" :item-width="200" item-key="cardId"
                item-class="q-pb-sm"
            >
                <router-link
                    :key="entityId"
                    :to="cardLink(entityId, version)"
                    target="_blank"
                >
                    <card-image
                        :id="entityId"
                        :version="last(version)"
                    />
                </router-link>
            </grid>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useCore } from 'store/core';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useHearthstone } from 'store/games/hearthstone';

import pageSetup from 'setup/page';
import hearthstoneSetup from 'setup/hearthstone';

import Grid from 'components/Grid.vue';
import CardImage from 'components/hearthstone/CardImage.vue';
import HearthstoneText from 'components/hearthstone/Text.vue';

import { Entity } from '@interface/hearthstone/entity';

import model from 'searcher-data/hearthstone/client';

import { apiGet } from 'boot/backend';
import { last } from 'lodash';

interface QueryParam {
    type: 'regex' | 'string';
    value: string;
}

interface QueryItem {
    type: string;
    op: string;
    param: QueryParam;
}

type Unwind<T extends { parts: any[] }> = Omit<T, 'parts'> & {
    parts: T['parts'][0];
    partIndex: number;
};

type QueryCard = Entity;

interface QueryResult {
    total: number;
    cards: QueryCard[];
}

interface SearchResult {
    text: string;
    commands: QueryItem[];
    queries: any[];
    errors: { type: string, value: string, query?: string }[];
    result: QueryResult | null;
}

const core = useCore();
const i18n = useI18n();
const router = useRouter();

const { search } = hearthstoneSetup();

const data = ref<SearchResult | null>(null);
const searching = ref(false);

const { q, page, pageSize } = pageSetup({
    title:     () => i18n.t('ui.search'),
    titleType: 'input',

    params: {
        q: {
            type:     'string',
            bind:     'query',
            readonly: true,
        },
        page: {
            type:    'number',
            bind:    'query',
            default: 1,
        },
        pageSize: {
            type:    'number',
            bind:    'query',
            default: 100,
        },
    },

    actions: [
        {
            action:  'search',
            handler: search,
        },
    ],
});

const searchText = computed({
    get() { return core.search; },
    set(newValue: string) { (core as any).search = newValue; },
});

const explained = computed(() => model.explain(q.value, (key: string, named) => {
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

const cards = computed(() => data.value?.result?.cards ?? []);
const total = computed(() => data.value?.result?.total ?? 0);

const pageCount = computed(() => Math.ceil(total.value / pageSize.value));

const doSearch = async () => {
    if (q.value == null || q.value === '') {
        return;
    }

    searchText.value = q.value;

    searching.value = true;

    const { data: result } = await apiGet<SearchResult>('/hearthstone/search', {
        q:        q.value,
        page:     page.value,
        pageSize: pageSize.value,
    });

    if (result.text === q.value) {
        data.value = result;

        console.log(result);

        searching.value = false;
    }
};

const changePage = (newPage: number) => {
    if (page.value !== newPage) {
        page.value = newPage;
    }
};

const cardLink = (entityId: string, version?: number[]) => router.resolve({
    name:   'hearthstone/entity',
    params: { id: entityId },
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
