<template>
    <q-page class="content q-pa-md">
        <div
            v-for="c in chapterContent"
            :id="c.itemId" :key="c.itemId"
            :class="[
                'cr-item' ,
                `depth-${c.depth}`,
                ...(/[a-z!]$/.test(c.text) ? ['in-menu'] : []),
                ...(c.itemId === itemId && highlightItem(c) ? ['curr-item'] : [])
            ]"
        >
            <span v-if="c.serial != null">{{ c.serial + ' ' }}</span>
            <span v-else-if="c.itemId.includes(':e')" class="example">EXAMPLE</span>

            <rich-text detect-cr>{{ c.richText }}</rich-text>

            <div class="cr-tool flex items-center">
                <q-btn icon="mdi-content-copy" size="sm" flat dense round @click="copyItem(c)" />
                <q-btn icon="mdi-link" size="sm" :to="itemLink(c)" flat dense round />
                <q-btn v-if="hasHistory(c)" icon="mdi-history" size="sm" :to="historyLink(c)" target="_blank" flat dense round />
                <div class="item-id q-ml-md code">{{ c.itemId }}</div>
            </div>
        </div>
    </q-page>
</template>

<script setup lang="ts">
import {
    ref, computed, watch, onMounted, nextTick,
} from 'vue';

import { Menu } from 'layouts/WithMenu.vue';

import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useCore, useTitle, useParam } from 'store/core';

import RichText from 'src/components/magic/RichText.vue';

import { CR, Content } from '@interface/magic/cr';
import { RuleItem, RuleSummary, RuleSummaryItem } from '@model/magic/schema/rule';

import _, { last } from 'lodash';
import { copyToClipboard, Notify, scroll } from 'quasar';

import { getValue, trpc } from 'src/hono';

type GeneralContent = Omit<Content, 'index'> & { index?: Content['index'] };

type Chapter = {
    title:    RuleSummaryItem;
    contents: RuleSummaryItem[];
};

const emit = defineEmits<{
    'update:menu': [menu: Menu[]];
}>();

const router = useRouter();
const route = useRoute();
const i18n = useI18n();
const core = useCore();

const list = ref<string[]>([]);
const summary = ref<RuleSummary>();
const chapterContent = ref<RuleItem[]>([]);

const selected = defineModel<string | null>('selected');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const expanded = defineModel<string[]>('expanded');

useTitle(() => i18n.t('magic.rule.$self'));

const date = useParam('date', {
    type:    'enum',
    bind:    'query',
    inTitle: true,
    values:  list,
});

core.actions = [
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
                    name:  'magic/rule/diff',
                    query: {
                        from: date.value,
                        to:   list.value[list.value.length - 2],
                    },
                });
            } else {
                void router.push({
                    name:  'magic/rule/diff',
                    query: {
                        from: list.value[index + 1],
                        to:   date.value,
                    },
                });
            }
        },
    },
];

const contents = computed(() => summary.value?.contents ?? []);

const chapters = computed(() => {
    if (summary.value == null) {
        return [];
    }

    const result: Chapter[] = [];

    for (const c of contents.value) {
        if (c.depth === 0) {
            result.push({ title: c, contents: [] });
        } else {
            const lastChapter = last(result);
            if (lastChapter != null) {
                lastChapter.contents.push(c);
            } else {
                result.push({ title: c, contents: [] });
            }
        }
    }

    return result;
});

const highlightItem = (item: RuleItem) => {
    if (item.index != null) {
        return item.depth >= 1;
    } else {
        return item.itemId.startsWith('g:');
    }
};

const menu = computed(() => {
    if (summary.value == null) {
        return [];
    }

    const result: Menu[] = [];

    function insert(menuToInsert: Menu[], item: RuleSummaryItem, depth: number) {
        if (depth === 0) {
            menuToInsert.push({ id: item.itemId, label: item.text! });
        } else {
            const lastMenu = last(menuToInsert)!;

            if (lastMenu.children == null) { lastMenu.children = []; }
            insert(lastMenu.children, item, depth - 1);
        }
    }

    for (const c of contents.value) { insert(result, c, c.depth); }

    return result;
});

watch(menu, () => { emit('update:menu', menu.value); }, { immediate: true });

const indexRegex = /^(\d|\d\d\d|\d\d\d\.\d+[a-z]?)$/;

const itemId = computed({
    get() {
        const hash = route.hash.startsWith('#') ? route.hash.slice(1) : null;

        if (hash == null || hash === '') {
            return contents.value[0]?.itemId ?? 'intro';
        }

        for (const c of contents.value) {
            if (c.itemId === hash) {
                return c.itemId;
            }

            if (c.serial != null && c.serial.replace(/\.$/, '') === hash) {
                return c.itemId;
            }
        }

        return contents.value[0]?.itemId ?? 'intro';
    },
    set(newValue: string) {
        const oldItem = contents.value.find(v => v.itemId === itemId.value);
        const newItem = contents.value.find(v => v.itemId === newValue);

        if (newItem == null) {
            return;
        }

        if (newItem.serial != null && (oldItem == null || !route.hash.startsWith('#') || indexRegex.test(route.hash.slice(1)))) {
            void router.push({
                hash:  `#${newItem.serial.replace(/\.$/, '')}`,
                query: route.query,
            });
        } else {
            void router.push({
                hash:  `#${newItem.itemId}`,
                query: route.query,
            });
        }
    },
});

const chapter = computed(() => {
    for (const ch of chapters.value) {
        if (ch.title.itemId === itemId.value) {
            return ch.title.itemId;
        }

        if (ch.contents.some(c => c.itemId === itemId.value)) {
            return ch.title.itemId;
        }
    }

    return undefined;
});

// methods
const loadList = async () => {
    const value = await getValue(trpc.magic.rule.list, {});

    if (value != null) {
        list.value = value;
    }
};

const loadSummary = async () => {
    if (date.value == null) {
        return;
    }

    selected.value = null;

    const value = await getValue(trpc.magic.rule.summary, { date: date.value });

    if (value != null) {
        summary.value = value as RuleSummary;
    }
};

const loadChapter = async () => {
    if (date.value == null || chapter.value == null) {
        return;
    }

    const chapterItem = chapters.value.find(c => c.title.itemId === chapter.value)!;

    const from = chapterItem.title.index;
    const to = _.last(chapterItem.contents)?.index ?? chapterItem.title.index;

    const value = await getValue(trpc.magic.rule.chapter, {
        date: date.value,
        lang: summary.value?.lang,
        from: from.toString(),
        to:   to.toString(),
    });

    if (value != null) {
        chapterContent.value = value as RuleItem[];
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

const hasHistory = (item: RuleItem) => !['intro.title', 'intro', 'glossary', 'credits.title', 'credits'].includes(item.itemId);

const itemLink = (item: RuleItem) => ({ hash: `#${item.itemId}`, query: route.query });
const historyLink = (item: RuleItem) => ({ name: 'magic/rule/history', query: { id: item.itemId } });
const itemText = (item: RuleItem) => (item.index != null ? `${item.index} ${item.text}` : item.text);

const copyItem = async (item: RuleItem) => {
    await copyToClipboard(itemText(item));

    Notify.create(i18n.t('magic.ui.rule.copy-text'));
};

// watch
watch(date, loadSummary, { immediate: true });

watch(selected, () => {
    if (selected.value != null && selected.value !== itemId.value) {
        itemId.value = selected.value;
        selected.value = null;
    }
});

watch(itemId, scrollIntoItem, { immediate: true });

watch(chapter, loadChapter, { immediate: true });

onMounted(loadList);

</script>

<style lang="sass" scoped>
.cr-item
    transition-duration: 0.3s

    &.depth-0.in-menu
        font-size: 200%
        margin-bottom: 20px

    &.depth-1.in-menu
        font-size: 150%
        margin-bottom: 10px

    &.depth-2, &.depth-3, &.depth-4
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

.example
    border: 1px $primary solid
    color: $primary

    padding-left: 2px
    padding-right: 2px
    margin-right: 5px

</style>
