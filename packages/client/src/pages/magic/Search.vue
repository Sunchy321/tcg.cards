<template>
    <q-page>
        <div class="controller flex items-center z-top shadow-4 q-px-md">
            <q-icon v-show="searching" name="mdi-autorenew mdi-spin" size="sm" />

            <div class="col-grow" />

            <span v-if="data != null" class="code q-mr-md">{{ total }}</span>

            <q-pagination
                :value="page"
                class="code"
                :max="pageCount"
                :input="true"
                @input="changePage"
            />
        </div>
        <div class="result q-py-md">
            <div ref="card-panel" class="card-panel flex justify-center q-gutter-md">
                <q-resize-observer @resize="calcCardPanelInfo" />
                <router-link
                    v-for="c in cards" :key="c.cardId"
                    :to="`/magic/card/${c.cardId}?set=${c.setId}&number=${c.number}&lang=${c.lang}`"
                    :style="{ width: cardPanelInfo.itemWidth + 'px' }"
                >
                    <card-image
                        :set="c.setId"
                        :number="c.number"
                        :lang="c.lang"
                        :layout="c.layout"
                    />
                </router-link>

                <template v-if="cardPanelInfo.placeholder > 0">
                    <div
                        v-for="i in cardPanelInfo.placeholder" :key="i"
                        class="placeholder"
                        :style="{ width: cardPanelInfo.itemWidth + 'px' }"
                    />
                </template>
            </div>
        </div>
    </q-page>
</template>

<style lang="stylus" scoped>

.controller
    height 50px

    position fixed
    top 50px
    left 0
    right 0

    background-color lighten($primary, 20%)

    & >>> *
        color white !important

.result
    margin-top 50px

</style>

<script>
import magic from 'src/mixins/magic';

import CardImage from 'components/magic/CardImage';

import routeComputed from 'src/route-computed';

export default {
    name: 'Search',

    components: { CardImage },

    mixins: [magic],

    data: () => ({
        data:      null,
        searching: false,

        cardPanelInfo: {
            itemWidth:   0,
            itemPerLine: 5,
            placeholder: 0,
        },
    }),

    computed: {
        q() { return this.$route.query.q; },

        cards() { return this.data?.result?.cards || []; },
        total() { return this.data?.result?.total || 0; },

        page:     routeComputed('page', { number: true, default: 1 }),
        pageSize: routeComputed('page-size', { number: true, default: 100 }),

        pageCount() { return Math.ceil(this.total / this.pageSize); },
    },

    watch: {
        $route: {
            immediate: true,
            handler() {
                this.search();
            },
        },

        cards() {
            this.calcCardPanelInfo();
        },
    },

    methods: {
        async search() {
            if (this.searching) {
                return;
            }

            this.searching = true;

            const { data } = await this.apiGet('/magic/search', {
                q:        this.q,
                locale:   this.$store.getters['magic/locale'],
                page:     this.page,
                pageSize: this.pageSize,
            });

            this.data = data;

            this.searching = false;
        },

        changePage(newPage) {
            if (this.page !== newPage) {
                this.page = newPage;
                this.search();
            }
        },

        calcCardPanelInfo() {
            const panel = this.$refs['card-panel'];

            if (panel == null) {
                return;
            }

            const margin = 16;
            const panelWidth = panel.clientWidth;
            const maxItemWidth = panelWidth - 2 * margin;

            const itemWidth = maxItemWidth < 200 ? maxItemWidth : 200;
            const itemPerLine = panel ? Math.floor((panelWidth - margin) / (itemWidth + margin)) : 5;

            const placeholder = this.cards.length % itemPerLine === 0
                ? 0
                : itemPerLine - (this.cards.length % itemPerLine);

            this.cardPanelInfo = { itemWidth, itemPerLine, placeholder };
        },
    },
};
</script>

<style>

</style>
