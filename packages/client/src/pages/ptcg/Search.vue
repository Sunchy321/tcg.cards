<template>
    <q-page>
        <div class="controller flex items-center shadow-4 q-px-md">
            <q-icon v-show="searching" class="q-mr-sm" name="mdi-autorenew mdi-spin" size="sm" />

            <div>
                <ptcg-text>{{ explained.text }}</ptcg-text>
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
                v-slot="{ cardId, print: { set, number, lang, layout }}"
                :value="cards" :item-width="200" item-key="cardId"
                item-class="q-pb-sm"
            >
                <router-link
                    :key="cardId"
                    :to="cardLink(cardId, set, number, lang)"
                    target="_blank"
                >
                    <card-image
                        :set="set"
                        :number="number"
                        :lang="imageLang(lang, set)"
                        :layout="layout"
                    />
                </router-link>
            </grid>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';

import { useCore } from 'store/core';
import { useGame } from 'store/games/ptcg';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';
import ptcgSetup from 'setup/ptcg';

import Grid from 'components/Grid.vue';
import CardImage from 'components/ptcg/CardImage.vue';
import LorcanaText from 'components/ptcg/Text.vue';

import { Card } from '@interface/ptcg/card';
import { Print } from '@interface/ptcg/print';

import model from 'searcher-data/ptcg/client';

import { apiGet } from 'boot/server';

interface QueryParam {
    type:  'regex' | 'string';
    value: string;
}

interface QueryItem {
    type:  string;
    op:    string;
    param: QueryParam;
}

interface QueryCard {
    cardId: string;
    card:   Card;
    print:  Print;
}

interface QueryResult {
    total: number;
    cards: QueryCard[];
}

interface SearchResult {
    text:     string;
    commands: QueryItem[];
    queries:  any[];
    errors:   { type: string, value: string, query?: string }[];
    result:   QueryResult | null;
}

const core = useCore();
const game = useGame();
const i18n = useI18n();

const { search } = ptcgSetup();

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
        realKey = `ptcg.search.${key.slice(2)}`;
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

const imageLang = (lang: string, _set: string) => lang;

const doSearch = async () => {
    if (q.value == null || q.value === '') {
        return;
    }

    searchText.value = q.value;

    searching.value = true;

    const { data: result } = await apiGet<SearchResult>('/ptcg/search', {
        q:        q.value,
        locale:   game.locale,
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

const cardLink = (
    cardId: string,
    set: string,
    number: string,
    lang: string,
) => `/ptcg/card/${cardId}?set=${set}&number=${number}&lang=${lang}`;

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
