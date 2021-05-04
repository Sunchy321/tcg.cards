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
import { defineComponent, ref, computed, watch, onUpdated, onMounted, nextTick } from 'vue';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';

import pageSetup from 'setup/page';

import MagicText from 'components/magic/Text.vue';

import { last } from 'lodash';
import { scroll } from 'quasar';
import { apiGet } from 'boot/backend';

interface Content {
    id: string;
    depth: number;
    index: string;
    text: string;
    examples?: string[];
    cards?: { text:string, id:string }[]
}

interface Glossary {
    words: string[];
    ids: string[];
    text: string;
}

interface CR {
    date: string;
    intro: string;
    contents: Content[];
    glossary: Glossary[];
    credits: string;
    csi?: string;
}

interface Menu {
    id: string;
    label: string;
    children?: Menu[];
}

interface ContentItem {
    id: string;
    depth: number;
    index?: string;
    text: string;
    examples?: string[];
    cards?: { text:string, id:string }[]
}

export default defineComponent({
    components: { MagicText },

    setup() {
        const router = useRouter();
        const route = useRoute();
        const i18n = useI18n();

        const list = ref<string[]>([]);
        const data = ref<CR|null>(null);
        const selected = ref<string|null>(null);
        const expanded = ref([]);

        const { date } = pageSetup({
            title: () => i18n.t('magic.cr.$self'),

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

            params: {
                date: {
                    type:   'enum',
                    bind:   'query',
                    values: () => list.value,
                },
            },
        });

        const menu = computed(() => {
            if (data.value == null) {
                return null;
            }

            const menu: Menu[] = [];

            const contents = data.value.contents
                .filter(c => c.examples == null && /\w$/.test(c.text));

            const contentMenu: Menu[] = [];

            menu.push({
                id:    'intro',
                label: i18n.t('magic.cr.intro'),
            });

            function insert(menu: Menu[], item: Content, depth: number) {
                if (depth === 0) {
                    menu.push({ id: item.id, label: item.text });
                } else {
                    const lastMenu = last(menu)!;

                    if (lastMenu.children == null) { lastMenu.children = []; }
                    insert(lastMenu.children, item, depth - 1);
                }
            }

            for (const c of contents) { insert(contentMenu, c, c.depth); }

            menu.push(...contentMenu);

            menu.push(
                {
                    id:    'glossary',
                    label: i18n.t('magic.cr.glossary'),
                },
                {
                    id:    'credits',
                    label: i18n.t('magic.cr.credits'),
                },
            );

            if (data.value.csi) {
                menu.push({
                    id:    'csi',
                    label: i18n.t('magic.cr.csi'),
                });
            }

            return menu;
        });

        const item = computed({
            get() {
                const hash = route.hash;

                if (hash.startsWith('#')) {
                    const id = hash.slice(1);

                    if (['intro', 'glossary', 'credits', 'csi'].includes(id)) {
                        return id;
                    }

                    if (data.value?.contents?.some(c => c.id === id)) {
                        return id;
                    }
                }

                return 'intro';
            },
            set(newValue: string) {
                void router.push({
                    hash:  '#' + newValue,
                    query: route.query,
                });
            },
        });

        const chapter = computed(() => {
            switch (item.value) {
            case 'intro':
            case 'intro.title':
                return 'intro';
            case 'glossary':
            case 'glossary.title':
                return 'glossary';
            case 'credits':
            case 'credits.title':
                return 'credits';
            case 'csi':
            case 'csi.title':
                return 'csi';
            default:
                return data.value?.contents?.find(c => c.id === item.value)?.index[0];
            }
        });

        const chapterContent = computed((): ContentItem[] => {
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
                        text:  data.value!.intro,
                    },
                ];

            case 'glossary':
                return [
                    {
                        id:    'glossary.title',
                        depth: 0,
                        text:  i18n.t('magic.cr.glossary'),
                    },
                    ...(data.value?.glossary ?? []).map(g => ({
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
                        text:  i18n.t('magic.cr.credits'),
                    },
                    {
                        id:    'credits',
                        depth: 2,
                        text:  data.value!.credits,
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
                        text:  data.value!.csi!,
                    },
                ];
            default:
                return data.value?.contents
                    ?.filter(c => c.index.startsWith(chapter.value!)) ??
                    [];
            }
        });

        // methods
        const loadList = async() => {
            const { data } = await apiGet<string[]>('/magic/cr');

            list.value = data;
        };

        const loadData = async() => {
            selected.value = null;

            if (date.value != null) {
                const { data: crResult } = await apiGet<CR>('/magic/cr/' + date.value);
                data.value = crResult;
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

        onUpdated(async () => {
            await nextTick();

            const elem = document.getElementById(item.value);

            if (elem != null) {
                const target = scroll.getScrollTarget(elem);
                const offset = elem.offsetTop - elem.scrollHeight;
                scroll.setHorizontalScrollPosition(target, offset, 500);
            }
        });

        onMounted(loadList);

        return {
            data,
            selected,
            expanded,

            menu,
            chapterContent,
        };
    },

});
</script>
