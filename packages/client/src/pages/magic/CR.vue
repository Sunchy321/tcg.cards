<template>
    <q-page class="content q-pa-md">
        <div
            v-for="c in chapterContent"
            :id="c.id" :key="c.id"
            :class="`cr-item depth-${c.depth} ${c.id === itemId && highlightItem(c) ? 'curr-item' : ''}`"
        >
            <span v-if="c.index != null">{{ c.index + ' ' }}</span>
            <magic-text :cards="c.cards" detect-cr>{{ c.text }}</magic-text>

            <div v-for="(e, i) in c.examples || []" :key="i" class="example">
                <q-icon name="mdi-chevron-right" class="example-icon" />
                <magic-text :cards="c.cards">{{ e }}</magic-text>
            </div>

            <div class="cr-tool flex items-center">
                <q-btn icon="mdi-content-copy" size="sm" flat dense round @click="copyItem(c)" />
                <q-btn icon="mdi-link" size="sm" :to="itemLink(c)" flat dense round />
                <div class="item-id q-ml-md code">{{ c.id }}</div>
            </div>
        </div>
    </q-page>
</template>

<style lang="sass" scoped>
.cr-item
    transition-duration: 0.3s

    &.depth-0
        font-size: 200%
        margin-bottom: 20px

    &.depth-1
        font-size: 150%
        margin-bottom: 10px

    &.depth-2, &.depth-3
        margin-bottom: 10px

    & .cr-tool
        display: none

        color: grey

    & .item-id
        font-size: 12px

    &:hover
        margin-bottom: 5px
        background-color: $grey-3

    &:hover .cr-tool
        display: flex
        background-color: $grey-3

    &.curr-item
        border: 1px black solid
        border-radius: 5px

        padding: 2px

.example-icon
    margin-right: 10px
    color: $primary

</style>

<script lang="ts">
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import {
    defineComponent, ref, computed, watch, onMounted, nextTick, PropType,
} from 'vue';

import { Menu } from 'layouts/WithMenu.vue';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import MagicText from 'components/magic/Text.vue';

import { CR, Content } from 'interface/magic/cr';

import { last } from 'lodash';
import { scroll } from 'quasar';
import copy from 'copy-to-clipboard';

import modelWrapper from 'src/model-wrapper';

import { apiGet } from 'boot/backend';

type GeneralContent = Omit<Content, 'index'> & { index?: Content['index'] };

export default defineComponent({
    components: { MagicText },

    props: {
        selected: { type: String as PropType<string | null>, default: null },
        expanded: { type: Array as PropType<string[]>, default: () => [] },
    },

    emits: ['update:menu', 'update:selected', 'update:expanded'],

    setup(props, { emit }) {
        const router = useRouter();
        const route = useRoute();
        const i18n = useI18n();

        const list = ref<string[]>([]);
        const cr = ref<CR | null>(null);
        const selected = modelWrapper('selected', props, emit);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const expanded = modelWrapper('expanded', props, emit);

        const { date } = pageSetup({
            title: () => i18n.t('magic.cr.$self'),

            params: {
                date: {
                    type:    'enum',
                    bind:    'query',
                    inTitle: true,
                    values:  () => list.value,
                },
            },

            actions: [
                {
                    icon:   'mdi-vector-difference',
                    action: 'diff',
                    handler() {
                        const index = list.value.indexOf(date.value);

                        if (index === -1) {
                            return;
                        }

                        if (index === list.value.length - 1) {
                            void router.push({
                                name:  'magic/cr/diff',
                                query: {
                                    from: date.value,
                                    to:   list.value[list.value.length - 2],
                                },
                            });
                        } else {
                            void router.push({
                                name:  'magic/cr/diff',
                                query: {
                                    from: list.value[index + 1],
                                    to:   date.value,
                                },
                            });
                        }
                    },
                },
            ],
        });

        const contents = computed(() => cr.value?.contents ?? []);
        const glossary = computed(() => cr.value?.glossary ?? []);

        const itemInMenu = (item: Content) => /\w$/.test(item.text) && item.examples == null;

        const highlightItem = (item: GeneralContent) => {
            if (item.index != null) {
                return !itemInMenu(item as Content);
            } else {
                return item.id.startsWith('g:');
            }
        };

        const menu = computed(() => {
            if (cr.value == null) {
                return [];
            }

            const menuResult: Menu[] = [];

            const contentInMenu = contents.value.filter(itemInMenu);

            const contentMenu: Menu[] = [];

            menuResult.push({ id: 'intro', label: i18n.t('magic.cr.intro') });

            function insert(menuToInsert: Menu[], item: Content, depth: number) {
                if (depth === 0) {
                    menuToInsert.push({ id: item.id, label: item.text });
                } else {
                    const lastMenu = last(menuToInsert)!;

                    if (lastMenu.children == null) { lastMenu.children = []; }
                    insert(lastMenu.children, item, depth - 1);
                }
            }

            for (const c of contentInMenu) { insert(contentMenu, c, c.depth); }

            menuResult.push(...contentMenu);

            menuResult.push(
                { id: 'glossary', label: i18n.t('magic.cr.glossary') },
                { id: 'credits', label: i18n.t('magic.cr.credits') },
            );

            if (cr.value?.csi != null) {
                menuResult.push({ id: 'csi', label: i18n.t('magic.cr.csi') });
            }

            return menuResult;
        });

        watch(menu, () => { emit('update:menu', menu.value); }, { immediate: true });

        const indexRegex = /^(\d|\d\d\d|\d\d\d\.\d+[a-z]?)$/;

        const simpleItems = [
            'intro', 'intro.title',
            'glossary',
            'credits', 'credits.title',
            'csi', 'csi.title',
        ];

        const itemId = computed({
            get() {
                const hash = route.hash.startsWith('#') ? route.hash.slice(1) : null;

                if (hash != null) {
                    // simple items
                    if (simpleItems.includes(hash)) {
                        return hash;
                    }

                    // glossary items
                    if (hash.startsWith('g:')) {
                        const glossaryId = hash.slice(2);

                        if (glossary.value.some(g => glossaryId === g.ids.join(','))) {
                            return hash;
                        }
                    }

                    // content items
                    if (contents.value.some(c => c.id === hash)) {
                        return hash;
                    }

                    const itemValue = contents.value.find(c => c.index.replace(/\.$/, '') === hash);

                    if (itemValue != null) {
                        return itemValue.id;
                    }
                }

                return 'intro';
            },
            set(newValue: string) {
                // simple or glossary item only have one style
                if (simpleItems.includes(newValue) || newValue.startsWith('g:')) {
                    void router.push({
                        hash:  `#${newValue}`,
                        query: route.query,
                    });
                    return;
                }

                const oldItem = contents.value.find(v => v.id === itemId.value);
                const newItem = contents.value.find(v => v.id === newValue);

                if (newItem == null) {
                    return;
                }

                if (oldItem == null || !route.hash.startsWith('#') || indexRegex.test(route.hash.slice(1))) {
                    void router.push({
                        hash:  `#${newItem.index.replace(/\.$/, '')}`,
                        query: route.query,
                    });
                } else {
                    void router.push({
                        hash:  `#${newItem.id}`,
                        query: route.query,
                    });
                }
            },
        });

        const chapter = computed(() => {
            switch (itemId.value) {
            case 'intro':
            case 'intro.title':
                return 'intro';
            case 'glossary':
                return 'glossary';
            case 'credits':
            case 'credits.title':
                return 'credits';
            case 'csi':
            case 'csi.title':
                return 'csi';
            default:
                if (itemId.value.startsWith('g:')) {
                    return 'glossary';
                } else {
                    return contents.value.find(c => c.id === itemId.value)?.index[0];
                }
            }
        });

        const chapterContent = computed((): GeneralContent[] => {
            if (cr.value == null) {
                return [];
            }

            switch (chapter.value) {
            case 'intro':
                return [
                    { id: 'intro.title', depth: 0, text: i18n.t('magic.cr.intro') },
                    { id: 'intro', depth: 2, text: cr.value!.intro },
                ];

            case 'glossary':
                return [
                    { id: 'glossary', depth: 0, text: i18n.t('magic.cr.glossary') },
                    ...glossary.value.map(g => ({ id: `g:${g.ids.join(',')}`, depth: 2, text: `${g.words.join(', ')}\n${g.text}` })),
                ];
            case 'credits':
                return [
                    { id: 'credits.title', depth: 0, text: i18n.t('magic.cr.credits') },
                    { id: 'credits', depth: 2, text: cr.value!.credits },
                ];
            case 'csi':
                return [
                    { id: 'csi.title', depth: 0, text: i18n.t('magic.cr.csi') },
                    { id: 'csi', depth: 2, text: cr.value!.csi! },
                ];
            default:
                return contents.value.filter(c => c.index.startsWith(chapter.value!));
            }
        });

        // methods
        const loadList = async () => {
            const { data } = await apiGet<string[]>('/magic/cr');

            list.value = data;
        };

        const loadData = async () => {
            selected.value = null;

            if (date.value != null) {
                const { data: crResult } = await apiGet<CR>('/magic/cr', {
                    date: date.value,
                });

                cr.value = crResult;
            }
        };

        const scrollIntoItem = async () => {
            await nextTick();

            const elem = document.getElementById(itemId.value);

            if (elem != null) {
                const target = scroll.getScrollTarget(elem);
                const offset = elem.offsetTop - elem.scrollHeight;
                scroll.setVerticalScrollPosition(target, offset, 500);
            }
        };

        const itemLink = (item: GeneralContent) => ({ hash: `#${item.id}`, query: route.query });
        const itemText = (item: GeneralContent) => (item.index != null ? `${item.index} ${item.text}` : item.text);

        const copyItem = (item: GeneralContent) => copy(itemText(item) + (item.examples ?? []).map(v => `\n    ${v}`).join(''));

        // watch
        watch(date, loadData, { immediate: true });

        watch(selected, () => {
            if (selected.value != null && selected.value !== itemId.value) {
                itemId.value = selected.value;
                selected.value = null;
            }
        });

        watch(itemId, scrollIntoItem, { immediate: true });

        onMounted(loadList);

        return {
            data: cr,

            menu,
            chapterContent,
            itemId,

            highlightItem,
            itemLink,
            itemText,
            copyItem,
        };
    },

});
</script>
