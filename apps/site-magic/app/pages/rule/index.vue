<template>
  <div class="flex gap-0 min-h-screen">
    <!-- Sidebar: chapter navigation -->
    <aside
      class="w-64 shrink-0 sticky top-12 h-[calc(100vh-4.5rem)] overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-white/20 hidden lg:block shadow"
    >
      <div class="p-3">
        <!-- Date selector -->
        <USelect
          v-if="list.length > 0"
          :model-value="currentDate"
          :items="list"
          size="sm"
          class="mb-1 w-full"
          @update:model-value="v => setDate(v as string)"
        />

        <!-- Diff link (desktop) -->
        <div class="hidden lg:flex justify-start my-2">
          <NuxtLink :to="diffLink" target="_blank">
            <UButton
              icon="lucide:file-diff"
              variant="outline"
              size="sm"
            >
              {{ $t('magic.rule.diff') }}
            </UButton>
          </NuxtLink>
        </div>

        <!-- Tree navigation -->
        <UTree
          :items="treeItems"
          :model-value="selectedTreeItem"
          :default-expanded="currentChapter ? [currentChapter] : []"
          :get-key="item => item.itemId"
          :expanded-icon="null"
          :collapsed-icon="null"
          color="neutral"
          size="sm"
          @select="(_, item) => navigateToItem(item.itemId)"
        />
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex-1 min-w-0 px-6 py-4 bg-white dark:bg-gray-900 rounded-lg shadow">
      <!-- Mobile header: date + diff link -->
      <div class="lg:hidden flex items-center gap-2 mb-4">
        <USelect
          v-if="list.length > 0"
          :model-value="currentDate"
          :options="list"
          size="sm"
          class="flex-1"
          @update:model-value="v => setDate(v as string)"
        />
        <NuxtLink :to="`/rule/diff?from=${prevDate}&to=${currentDate}`">
          <UButton
            icon="lucide:git-diff"
            variant="ghost"
            size="sm"
          />
        </NuxtLink>
      </div>

      <!-- Rule items -->
      <div
        v-for="c in chapterContent"
        :id="c.itemId"
        :key="`${c.itemId}-${simpleHash(c.richText)}`"
        :class="[
          'rule-item group relative rounded px-2 py-1 transition-colors',
          `depth-${c.depth}`,
          isMenuHeading(c) ? 'is-menu' : '',
          c.itemId === itemId ? 'curr-item ring-1 ring-white' : '',
        ]"
      >
        <div class="flex items-start gap-1">
          <RuleSerial :item-id="c.itemId" :serial="c.serial" class="shrink-0 mt-0.5 text-gray-500 dark:text-white/80" />
          <RichText :detect-cr="true" :inline="true" class="flex-1 text-gray-900 dark:text-white/90">{{ c.richText }}</RichText>
        </div>

        <!-- Hover toolbar -->
        <div class="rule-tool absolute right-2 top-1 hidden group-hover:flex items-center gap-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1 shadow-sm">
          <UButton
            icon="lucide:copy"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="copyItem(c)"
          />
          <NuxtLink :to="itemLink(c)">
            <UButton
              icon="lucide:link"
              size="xs"
              variant="ghost"
              color="neutral"
            />
          </NuxtLink>
          <NuxtLink :to="historyLink(c)" target="_blank">
            <UButton
              icon="lucide:history"
              size="xs"
              variant="ghost"
              color="neutral"
            />
          </NuxtLink>
          <span class="text-gray-400 dark:text-white/40 font-mono text-xs ml-1">{{ c.itemId }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RuleItem, RuleSummary, RuleSummaryItem } from '#model/magic/schema/rule';
import { last } from 'lodash-es';

definePageMeta({
  layout: 'main',
  game:   'magic',
});

const { $orpc } = useNuxtApp();
const route = useRoute('rule');
const router = useRouter();
const i18n = useI18n();
useTitle(() => i18n.t('magic.rule.$self'));

// ─── State ────────────────────────────────────────────────────────────────────

const list = ref<string[]>([]);
const summary = ref<RuleSummary | null>(null);
const chapterContent = ref<RuleItem[]>([]);

// ─── Computed ─────────────────────────────────────────────────────────────────

const currentDate = computed(() => (route.query.date as string | undefined) ?? list.value[0] ?? '');

const prevDate = computed(() => {
  const idx = list.value.indexOf(currentDate.value);
  return list.value[idx + 1] ?? list.value[0] ?? '';
});

const contents = computed(() => summary.value?.contents ?? []);

// chapters: depth-0 items are roots, all deeper items are their contents.
// Used for currentChapter detection and chapter index range queries.
const chapters = computed(() => {
  const result: { title: RuleSummaryItem, contents: RuleSummaryItem[] }[] = [];
  for (const c of contents.value) {
    if (c.depth === 0) {
      result.push({ title: c, contents: [] });
    } else {
      const lastItem = last(result);
      if (lastItem != null) lastItem.contents.push(c);
    }
  }
  return result;
});

// The current item ID is driven by the URL hash.
const itemId = computed(() => {
  const hash = route.hash.startsWith('#') ? route.hash.slice(1) : null;

  if (!hash) return contents.value[0]?.itemId ?? 'intro';

  for (const c of contents.value) {
    if (c.itemId === hash) return c.itemId;
    if (c.serial != null && c.serial.replace(/\.$/, '') === hash) return c.itemId;
  }

  return contents.value[0]?.itemId ?? 'intro';
});

// Which chapter contains the current item.
const currentChapter = computed(() => {
  for (const ch of chapters.value) {
    if (ch.title.itemId === itemId.value) return ch.title.itemId;
    if (ch.contents.some(c => c.itemId === itemId.value)) return ch.title.itemId;
  }
  return undefined;
});

// UTree-compatible item type (extra fields allowed by TreeItem's index signature).
type NavItem = { label: string, itemId: string, children?: NavItem[] };

// Build a two-level tree for UTree: depth-0 items are roots, their
// text-bearing contents become children.
const treeItems = computed<NavItem[]>(() =>
  chapters.value.map(ch => {
    const children: NavItem[] = ch.contents
      .filter(c => c.text != null)
      .map(c => ({
        label:  `${c.serial?.replace(/\.$/, '') ?? ''} ${c.text!}`.trim(),
        itemId: c.itemId,
      }));

    return {
      label:  ch.title.text ?? ch.title.itemId,
      itemId: ch.title.itemId,
      ...(children.length ? { children } : {}),
    };
  }),
);

// The NavItem corresponding to the current itemId (for UTree v-model highlight).
const selectedTreeItem = computed<NavItem | undefined>(() => {
  for (const node of treeItems.value) {
    if (node.itemId === itemId.value) return node;
    for (const child of node.children ?? []) {
      if (child.itemId === itemId.value) return child;
    }
  }
  return undefined;
});

const diffLink = computed(() => ({
  path:  '/rule/diff',
  query: { from: prevDate.value, to: currentDate.value },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Simple string hash used as v-for key to force re-render on text change.
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

// Items whose text ends with a lowercase letter or '!' are headings in the CR.
const isMenuHeading = (item: RuleItem) => /[a-z!]$/.test(item.text);

const itemLink = (item: RuleItem) => ({
  hash:  `#${item.itemId}`,
  query: route.query,
});

const historyLink = (item: RuleItem) => ({
  path:  '/rule/history',
  query: { id: item.itemId },
});

const itemText = (item: RuleItem) =>
  item.index != null ? `${item.serial ?? ''} ${item.text}`.trim() : item.text;

const copyItem = async (item: RuleItem) => {
  await navigator.clipboard.writeText(itemText(item));
};

// ─── Navigation ───────────────────────────────────────────────────────────────

const setDate = (date: string) => {
  void router.push({ query: { ...route.query, date } });
};

const indexRegex = /^(\d|\d\d\d|\d\d\d\.\d+[a-z]?)$/;

const navigateToItem = (id: string) => {
  const item = contents.value.find(v => v.itemId === id);
  if (item == null) return;

  if (item.serial != null && (!route.hash.startsWith('#') || indexRegex.test(route.hash.slice(1)))) {
    void router.push({ hash: `#${item.serial.replace(/\.$/, '')}`, query: route.query });
  } else {
    void router.push({ hash: `#${item.itemId}`, query: route.query });
  }
};

const scrollToItem = async () => {
  await nextTick();
  const el = document.getElementById(itemId.value);
  if (el != null) {
    const headerHeight = document.querySelector('header')?.offsetHeight ?? 72;
    const rect = el.getBoundingClientRect();
    const fullyVisible = rect.top >= headerHeight && rect.bottom <= window.innerHeight;
    if (!fullyVisible) {
      const top = rect.top + window.scrollY - headerHeight - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }
};

// ─── Data loading ─────────────────────────────────────────────────────────────

const loadList = async () => {
  list.value = await $orpc.magic.rule.list({});
};

const loadSummary = async () => {
  if (!currentDate.value) return;
  summary.value = await $orpc.magic.rule.summary({ date: currentDate.value });
};

const loadChapter = async (scroll = true) => {
  if (!currentDate.value || currentChapter.value == null) return;

  const chapterObj = chapters.value.find(c => c.title.itemId === currentChapter.value);
  if (chapterObj == null) return;

  const from = chapterObj.title.index;
  const to = last(chapterObj.contents)?.index ?? chapterObj.title.index;

  chapterContent.value = await $orpc.magic.rule.chapter({
    date: currentDate.value,
    lang: summary.value?.lang,
    from,
    to,
  });

  if (scroll) await scrollToItem();
};

// ─── Watchers ─────────────────────────────────────────────────────────────────

// Guard flag: watchers only handle user-driven changes after initial load is done.
const initializing = ref(true);

watch(currentDate, () => {
  if (!initializing.value) void loadSummary();
});

watch([currentDate, currentChapter], () => {
  if (!initializing.value) void loadChapter();
});

watch(itemId, scrollToItem);

onMounted(async () => {
  try {
    const dateInUrl = route.query.date as string | undefined;

    if (dateInUrl) {
      // Date is already known from URL: fetch list and summary in parallel.
      await Promise.all([loadList(), loadSummary()]);
    } else {
      // Need the list first to resolve the default date, then load summary.
      await loadList();
      await loadSummary();
    }
    await loadChapter();
  } finally {
    initializing.value = false;
  }
});
</script>

<style lang="scss" scoped>
.rule-item {
  margin-bottom: 8px;

  &.is-menu {
    &.depth-0 { font-size: 1.8em; margin-bottom: 20px; }
    &.depth-1 { font-size: 1.4em; margin-bottom: 12px; }
  }

  &.depth-2, &.depth-3, &.depth-4 {
    margin-bottom: 8px;
  }

  &.curr-item {
    border-radius: 4px;
    padding: 4px 6px;
  }
}
</style>
