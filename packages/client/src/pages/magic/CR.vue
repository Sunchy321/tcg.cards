<template>
    <q-page class="row">
        <q-tree
            v-if="menu != null"
            v-model:selected="selected"
            v-model:expanded="expanded"
            class="menu col-2 scroll"
            no-connectors
            :nodes="menu"
            node-key="id"
        />
        <div v-if="data != null" class="detail col scroll q-pa-md">
            <div
                v-for="c in chapterContent"
                :id="c.id" :key="c.id"
                :class="`depth-${c.depth}`"
            >
                <magic-text>{{ c.index ? c.index + ' ' + c.text : c.text }}</magic-text>

                <div v-for="(e, i) in c.examples || []" :key="i" class="example">
                    <q-icon name="mdi-chevron-right" class="example-icon" />
                    <magic-text>{{ e }}</magic-text>
                </div>
            </div>
        </div>
    </q-page>
</template>

<style lang="sass" scoped>
.menu, .detail
    height: calc(100vh - 50px)

.depth-0
    font-size: 200%
    margin-bottom: 30px

.depth-1
    font-size: 150%
    margin-bottom: 20px

.depth-2
    margin-bottom: 15px

.depth-3
    margin-bottom: 15px

.example-icon
    margin-right: 10px
    color: $primary

</style>

<script lang="ts">
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
import {
    defineComponent, ref, computed, watch, onMounted, nextTick,
} from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import MagicText from 'components/magic/Text.vue';

import { CR, Content } from 'interface/magic/cr';

import { last } from 'lodash';
import { scroll } from 'quasar';
import { apiGet } from 'boot/backend';

interface Menu {
    id: string;
    label: string;
    children?: Menu[];
}

export default defineComponent({
    components: { MagicText },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const i18n = useI18n();

        const list = ref<string[]>([]);
        const cr = ref<CR | null>(null);
        const selected = ref<string | null>(null);
        const expanded = ref([]);

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

        const menu = computed(() => {
            if (cr.value == null) {
                return null;
            }

            const menuResult: Menu[] = [];

            const contents = cr.value.contents
                .filter(c => c.examples == null && /\w$/.test(c.text));

            const contentMenu: Menu[] = [];

            menuResult.push({
                id:    'intro',
                label: i18n.t('magic.cr.intro'),
            });

            function insert(menuToInsert: Menu[], item: Content, depth: number) {
                if (depth === 0) {
                    menuToInsert.push({ id: item.id, label: item.text });
                } else {
                    const lastMenu = last(menuToInsert)!;

                    if (lastMenu.children == null) { lastMenu.children = []; }
                    insert(lastMenu.children, item, depth - 1);
                }
            }

            for (const c of contents) { insert(contentMenu, c, c.depth); }

            menuResult.push(...contentMenu);

            menuResult.push(
                {
                    id:    'glossary',
                    label: i18n.t('magic.cr.glossary'),
                },
                {
                    id:    'credits',
                    label: i18n.t('magic.cr.credits'),
                },
            );

            if (cr.value?.csi != null) {
                menuResult.push({
                    id:    'csi',
                    label: i18n.t('magic.cr.csi'),
                });
            }

            return menuResult;
        });

        const indexRegex = /^(\d|\d\d\d|\d\d\d\.\d+[a-z]?)$/;

        const simpleItems = [
            'intro', 'intro.title',
            'glossary',
            'credits', 'credits.title',
            'csi', 'csi.title',
        ];

        const item = computed({
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

                        if (cr.value?.glossary?.some(g => glossaryId === g.ids.join(','))) {
                            return hash;
                        }
                    }

                    // content items
                    if (cr.value?.contents?.some(c => c.id === hash)) {
                        return hash;
                    }

                    const itemValue = cr.value?.contents.find(c => c.index.replace(/\.$/, '') === hash);

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

                const oldItem = cr.value?.contents?.find(v => v.id === item.value);
                const newItem = cr.value?.contents?.find(v => v.id === newValue);

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
            switch (item.value) {
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
                if (item.value.startsWith('g:')) {
                    return 'glossary';
                } else {
                    return cr.value?.contents?.find(c => c.id === item.value)?.index[0];
                }
            }
        });

        const chapterContent = computed((): (Omit<Content, 'index'> & { index?: Content['index'] })[] => {
            switch (chapter.value) {
            case 'intro':
                return [
                    {
                        id:    'intro.title',
                        depth: 0,
                        text:  i18n.t('magic.cr.intro'),
                    },
                    {
                        id:    'intro',
                        depth: 2,
                        text:  cr.value!.intro,
                    },
                ];

            case 'glossary':
                return [
                    {
                        id:    'glossary',
                        depth: 0,
                        text:  i18n.t('magic.cr.glossary'),
                    },
                    ...(cr.value?.glossary ?? []).map(g => ({
                        id:    `g:${g.ids.join(',')}`,
                        depth: 2,
                        text:  `${g.words.join(', ')}\n${g.text}`,
                    })),
                ];
            case 'credits':
                return [
                    {
                        id:    'credits.title',
                        depth: 0,
                        text:  i18n.t('magic.cr.credits'),
                    },
                    {
                        id:    'credits',
                        depth: 2,
                        text:  cr.value!.credits,
                    },
                ];
            case 'csi':
                return [
                    {
                        id:    'csi.title',
                        depth: 0,
                        text:  i18n.t('magic.cr.csi'),
                    },
                    {
                        id:    'csi',
                        depth: 2,
                        text:  cr.value!.csi!,
                    },
                ];
            default:
                return cr.value?.contents
                    ?.filter(c => c.index.startsWith(chapter.value!))
                    ?? [];
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

            const elem = document.getElementById(item.value);

            if (elem != null) {
                const target = scroll.getScrollTarget(elem);
                const offset = elem.offsetTop - elem.scrollHeight;
                scroll.setVerticalScrollPosition(target, offset, 500);
            }
        };

        // watch
        watch(date, loadData, { immediate: true });

        watch(selected, () => {
            if (selected.value != null && selected.value !== item.value) {
                item.value = selected.value;
                selected.value = null;
            }
        });

        watch(item, scrollIntoItem, { immediate: true });

        onMounted(loadList);

        return {
            data: cr,
            selected,
            expanded,

            menu,
            chapterContent,
        };
    },

});
</script>
