<template>
  <div class="py-4 px-4 bg-white dark:bg-gray-900 rounded-lg shadow">
    <!-- Controls -->
    <div class="flex items-center gap-3 mb-6 flex-wrap">
      <div class="flex-1" />

      <USelect
        :model-value="fromDate"
        :options="list"
        size="sm"
        class="w-40"
        @update:model-value="v => setFrom(v as string)"
      />

      <UButton icon="lucide:file-diff" variant="ghost" size="sm" @click="loadData" />

      <USelect
        :model-value="toDate"
        :options="list"
        size="sm"
        class="w-40"
        @update:model-value="v => setTo(v as string)"
      />

      <div class="flex-1 flex justify-end">
        <UCheckbox
          :model-value="showMinor"
          :label="$t('magic.rule.show-minor')"
          @update:model-value="v => setShowMinor(v as boolean)"
        />
      </div>
    </div>

    <!-- Diff rows -->
    <div
      v-for="d in computedDiff"
      :key="d.itemId"
      class="diff-row grid grid-cols-2 gap-0 border-b border-gray-200 dark:border-white/10 last:border-0"
    >
      <!-- Left: old version -->
      <div
        v-if="d.type !== 'add'"
        class="diff-cell p-2 border-r border-gray-200 dark:border-white/10"
        :class="[
          `depth-${d.depth[0]}`,
          isMenuHeading(d, 0) ? 'is-menu' : '',
        ]"
      >
        <RuleSerial
          out-of-chapter
          :item-id="d.itemId"
          :serial="d.serial[0]"
          :class="d.type ? typeClass(d.type) : ''"
        />
        <RichText
          v-for="(v, i) in d.text ?? []"
          :key="i"
          :inline="true"
          :class="textClass(v, 'remove')"
        >
          {{ textValue(v, 'remove') }}
        </RichText>
      </div>
      <div v-else class="diff-cell p-2 border-r border-gray-200 dark:border-white/10" />

      <!-- Right: new version -->
      <div
        v-if="d.type !== 'remove'"
        class="diff-cell p-2"
        :class="[
          `depth-${d.depth[1]}`,
          isMenuHeading(d, 1) ? 'is-menu' : '',
        ]"
      >
        <RuleSerial
          out-of-chapter
          :item-id="d.itemId"
          :serial="d.serial[1]"
          :class="d.type ? typeClass(d.type) : ''"
        />
        <RichText
          v-for="(v, i) in d.text ?? []"
          :key="i"
          :inline="true"
          :class="textClass(v, 'add')"
        >
          {{ textValue(v, 'add') }}
        </RichText>
      </div>
      <div v-else class="diff-cell p-2" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RuleDiff, RuleDiffItem, TextDiff } from '#model/magic/schema/rule';

definePageMeta({
  layout: 'main',
  game:   'magic',
});

const { $orpc } = useNuxtApp();
const route = useRoute('rule-diff');
const router = useRouter();
const i18n = useI18n();
useTitle(() => i18n.t('magic.rule.diff'));

// ─── State ────────────────────────────────────────────────────────────────────

const list = ref<string[]>([]);
const ruleDiff = ref<RuleDiff | null>(null);

// ─── Query params ─────────────────────────────────────────────────────────────

const fromDate = computed(() => (route.query.from as string | undefined) ?? list.value.at(-2) ?? '');
const toDate = computed(() => (route.query.to as string | undefined) ?? list.value.at(-1) ?? '');
const showMinor = computed(() => route.query['show-minor'] !== undefined);

const setFrom = (val: string) => {
  if (list.value.includes(val))
    void router.push({ query: { ...route.query, from: val } });
};

const setTo = (val: string) => {
  if (list.value.includes(val))
    void router.push({ query: { ...route.query, to: val } });
};

const setShowMinor = (val: boolean) => {
  void router.push({ query: { ...route.query, 'show-minor': val ? null : undefined } });
};

// ─── Computed ─────────────────────────────────────────────────────────────────

const diff = computed(() => ruleDiff.value?.diff ?? []);

const computedDiff = computed(() =>
  diff.value.filter(d => {
    if (showMinor.value) return true;
    return d.text?.some(t => t.type === 'diff' && !t.isMinor) ?? false;
  }),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const typeClass = (type: string) => {
  const map: Record<string, string> = {
    add:    'text-green-600 dark:text-green-400',
    remove: 'text-red-600 dark:text-red-400',
    move:   'text-amber-600 dark:text-amber-400',
  };
  return map[type] ?? '';
};

const textClass = (value: TextDiff, side: 'add' | 'remove') => {
  if (value.type === 'common') return '';
  const base = side === 'add' ? 'bg-green-100 dark:bg-green-500/30' : 'bg-red-100 dark:bg-red-500/30';
  return value.isMinor ? `${base} opacity-60` : base;
};

const textValue = (diff: TextDiff, side: 'add' | 'remove') => {
  if (diff.type === 'common') return diff.value;
  return side === 'remove' ? diff.value[0] : diff.value[1];
};

const isMenuHeading = (d: RuleDiffItem, i: 0 | 1) => {
  if (d.itemId === 'credits.text') return false;
  const last = d.text?.at(-1);
  if (last == null) return false;
  if (last.type === 'common') return /[a-z!]$/.test(last.value);
  return /[a-z!]$/.test(last.value[i]);
};

// ─── Data loading ─────────────────────────────────────────────────────────────

const loadList = async () => {
  list.value = await $orpc.magic.rule.list({});
};

const loadData = async () => {
  if (!fromDate.value || !toDate.value) return;
  ruleDiff.value = await $orpc.magic.rule.diff({ from: fromDate.value, to: toDate.value });
};

watch([fromDate, toDate], loadData, { immediate: true });

onMounted(() => {
  void loadList();
  void loadData();
});
</script>

<style lang="scss" scoped>
.diff-cell {
  &.is-menu {
    &.depth-0 { font-size: 1.6em; margin-bottom: 16px; }
    &.depth-1 { font-size: 1.3em; margin-bottom: 10px; }
  }

  &.depth-2, &.depth-3, &.depth-4 {
    font-size: 0.95em;
  }
}
</style>
