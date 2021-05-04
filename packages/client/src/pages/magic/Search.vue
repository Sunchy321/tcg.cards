<template>
    <q-page>
        <div class="controller flex items-center shadow-4 q-px-md">
            <q-icon v-show="searching" name="mdi-autorenew mdi-spin" size="sm" />

            <div class="col-grow" />

            <span v-if="data != null" class="code q-mr-md">{{ total }}</span>

            <q-pagination
                :model-value="page"
                class="code"
                :max="pageCount"
                :input="true"
                @input="changePage"
            />
        </div>
        <div class="result q-py-md">
            <grid
                v-slot="{ cardId, setId, number, lang, layout }"
                :value="cards" :item-width="200" item-key="cardId"
            >
                <router-link
                    :key="cardId"
                    :to="`/magic/card/${cardId}?set=${setId}&number=${number}&lang=${lang}`"
                >
                    <card-image
                        :set="setId"
                        :number="number"
                        :lang="lang"
                        :layout="layout"
                    />
                </router-link>
            </grid>
        </div>
    </q-page>
</template>

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
    margi-right: 50px

.card-panel
    justify-content: center !important
</style>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';

import { useStore } from 'src/store';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import Grid from 'components/Grid.vue';
import CardImage from 'components/magic/CardImage.vue';

import { apiGet } from 'boot/backend';

interface QueryParam {
    type: 'string' | 'regex',
    value: string
}

interface QueryItem {
    type: string,
    op: string,
    param: QueryParam
}

interface QueryResult {
    onlyId: false,
    total: number,
    cards: { cardId: string, set: string, number: string, lang: string, layout: string }[]
}

interface SearchResult {
    text: string;
    commands: QueryItem[];
    queries: any[];
    errors: { type: string; value: string, query?: string }[];
    result: QueryResult | null
}

export default defineComponent({
    name: 'Search',

    components: { Grid, CardImage },

    setup() {
        const store = useStore();
        const i18n = useI18n();

        const data = ref<SearchResult|null>(null);
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
        });

        const cards = computed(() => { return data.value?.result?.cards || []; });
        const total = computed(() => { return data.value?.result?.total || 0; });

        const pageCount = computed(() => { return Math.ceil(total.value / pageSize.value); });

        const search = async () => {
            if (searching.value) {
                return;
            }

            searching.value = true;

            const { data: result } = await apiGet<SearchResult>('/magic/search', {
                q:        q.value,
                locale:   store.getters['magic/locale'],
                page:     page.value,
                pageSize: pageSize.value,
            });

            data.value = result;

            searching.value = false;
        };

        const changePage = (newPage: number) => {
            if (page.value !== newPage) {
                page.value = newPage;
                void search();
            }
        };

        watch(q, search, { immediate: true });

        return {
            searching,

            data,
            total,
            page,
            pageCount,
            cards,

            changePage,
        };
    },

});
</script>
