<template>
    <q-page class="row">
        <q-tree
            v-if="menu != null"
            class="menu col-2 scroll"
            no-connectors
            :nodes="menu"
            node-key="id"
            :selected.sync="selected"
            :expanded.sync="expanded"
        />
        <div v-if="data != null" class="detail col scroll q-pa-md">
            <div
                v-for="c in chapterContent"
                :id="c.id" :key="c.id"
                :class="`depth-${c.depth}`"
            >
                <magic-text :value="c.index ? c.index + ' ' + c.text : c.text" />

                <div v-for="(e, i) in c.examples || []" :key="i" class="example">
                    <q-icon name="mdi-chevron-right" class="example-icon" />
                    <magic-text :value="e" />
                </div>
            </div>
        </div>
    </q-page>
</template>

<style lang="stylus" scoped>
.menu, .detail
    height calc(100vh - 50px)

.depth-0
    font-size 200%
    margin-bottom 30px

.depth-1
    font-size 150%
    margin-bottom 20px

.depth-2
    margin-bottom 15px

.depth-3
    margin-bottom 15px

.example-icon
    margin-right 10px
    color $primary

</style>

<script>
import MagicText from 'components/magic/Text';

import basic from 'src/mixins/basic';

import { last } from 'lodash';
import { scroll } from 'quasar';

export default {
    name: 'CR',

    components: { MagicText },

    mixins: [basic],

    data: () => ({
        data:        null,
        selected:    null,
        expanded:    [],
        unsubscribe: null,
    }),

    computed: {
        date() { return this.selection; },

        menu() {
            if (this.data == null) {
                return null;
            }

            const contents = this.data.contents
                .filter(c => c.example == null && /\w$/.test(c.text));

            const menu = [];

            function insert(menu, item, depth) {
                if (depth === 0) {
                    menu.push({
                        id:    item.id,
                        label: item.text,
                    });
                } else {
                    const lastMenu = last(menu);

                    if (lastMenu.children == null) {
                        lastMenu.children = [];
                    }

                    insert(lastMenu.children, item, depth - 1);
                }
            }

            for (const c of contents) {
                insert(menu, c, c.depth);
            }

            return [
                {
                    id:    'intro',
                    label: this.$t('magic.cr.intro'),
                },
                ...menu,
                {
                    id:    'glossary',
                    label: this.$t('magic.cr.glossary'),
                },
                {
                    id:    'credits',
                    label: this.$t('magic.cr.credits'),
                },
            ];
        },

        item: {
            get() {
                const hash = this.$route.hash;

                if (hash.startsWith('#')) {
                    const id = hash.slice(1);

                    if (id === 'intro' || id === 'glossary' || id === 'credits') {
                        return id;
                    }

                    if (this.data?.contents?.some(c => c.id === id)) {
                        return id;
                    }
                }

                return 'intro';
            },
            set(newValue) {
                this.$router.push({
                    hash:  newValue,
                    query: this.$route.query,
                });
            },
        },

        chapter() {
            switch (this.item) {
            case 'intro':
                return 'intro';
            case 'glossary':
                return 'glossary';
            case 'credits':
                return 'credits';
            default:
                return this.data?.contents?.find(c => c.id === this.item)?.index[0];
            }
        },

        chapterContent() {
            switch (this.chapter) {
            case 'intro':
                return [
                    {
                        id:    'intro.title',
                        depth: 0,
                        text:  this.$t('magic.cr.intro'),
                    },
                    {
                        id:    'intro',
                        depth: 2,
                        text:  this.data?.intro,
                    },
                ];
            default:
                return this.data?.contents
                    ?.filter(c => c.index.startsWith(this.chapter)) ??
                    [];
            case 'glossary':
                return [
                    {
                        id:    'glossary.title',
                        depth: 0,
                        text:  this.$t('magic.cr.glossary'),
                    },
                    ...(this.data?.glossary ?? []).map(g => ({
                        id:    'g:' + g.ids.join(','),
                        depth: 2,
                        text:  g.words.join(', ') + '\n' + g.text,
                    })),
                ];
            case 'credits':
                return [
                    {
                        id:    'credits.title',
                        depth: 0,
                        text:  this.$t('magic.cr.credits'),
                    },
                    {
                        id:    'credits',
                        depth: 2,
                        text:  this.data?.credits,
                    },
                ];
            }
        },
    },

    watch: {
        date: {
            immediate: true,
            handler() {
                this.selected = null;
                this.loadData();
            },
        },

        selected() {
            if (this.selected != null && this.selected !== this.item) {
                this.item = this.selected;
                this.selected = null;
            }
        },
    },

    updated() {
        this.$nextTick(() => {
            const elem = document.getElementById(this.item);
            if (elem != null) {
                const target = scroll.getScrollTarget(elem);
                const offset = elem.offsetTop - elem.scrollHeight;
                scroll.setScrollPosition(target, offset, 500);
            }
        });
    },

    mounted() {
        this.loadList();
    },

    beforeRouteEnter(to, from, next) {
        next(vm => {
            vm.baseUnsubscribe = vm.$store.subscribe(async ({ type, payload }) => {
                if (type === 'event' && payload.type === 'diff') {
                    const index = vm.selections.indexOf(vm.date);

                    if (index === -1) {
                        return;
                    }

                    if (index === vm.selections.length - 1) {
                        vm.$router.push({
                            name:  'magic/cr/diff',
                            query: {
                                from: vm.selections[index - 1],
                                to:   vm.date,
                            },
                        });
                    } else {
                        vm.$router.push({
                            name:  'magic/cr/diff',
                            query: {
                                from: vm.date,
                                to:   vm.selections[index + 1],
                            },
                        });
                    }
                }
            });
        });
    },

    beforeRouteLeave(to, from, next) {
        this.baseUnsubscribe?.();
        next();
    },

    methods: {
        async loadList() {
            const { data } = await this.apiGet('/magic/cr/list');
            this.$store.commit('selections', data);
        },

        async loadData() {
            if (this.date != null) {
                const { data } = await this.apiGet('/magic/cr', { date: this.date });
                this.data = data;
            }
        },
    },
};
</script>
