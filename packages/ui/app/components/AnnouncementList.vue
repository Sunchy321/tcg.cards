<template>
  <div>
    <div class="mb-4 flex items-center justify-between gap-3">
      <slot name="header" />
      <USelect
        v-if="sourceOptions.length > 1"
        v-model="selectedSource"
        :items="sourceOptions"
        size="sm"
        class="w-40"
      />
    </div>

    <div v-if="filtered.length === 0" class="py-12 text-center text-gray-500">
      {{ $t('announcement.empty') }}
    </div>

    <div v-else class="space-y-6">
      <div v-for="group in monthGroups" :key="group.key">
        <h2 class="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
          {{ group.label }}
        </h2>
        <div class="divide-y divide-gray-100 dark:divide-gray-800">
          <NuxtLink
            v-for="row in group.rows"
            :key="row.id"
            :to="`${detailBase}/${row.id}`"
            class="flex cursor-pointer items-center gap-4 py-3 transition hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span class="w-24 shrink-0 truncate text-lg font-semibold">{{ row.name }}</span>
            <span
              class="rounded px-2 py-0.5 text-xs font-medium"
              :class="sourcePillClass"
            >{{ row.sourceLabel ?? row.source }}</span>
            <div class="flex-1" />
            <span class="shrink-0 font-mono text-sm text-gray-500 dark:text-gray-400">{{ row.date }}</span>
            <span class="w-16 shrink-0 text-right">
              <span class="font-medium">{{ row.itemCount }}</span>
              <span class="ml-1 text-xs text-gray-400 dark:text-gray-500">{{ $t('announcement.itemCountUnit') }}</span>
            </span>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** One announcement row of the list. */
interface AnnouncementListRow {
  id:           string;
  source:       string;
  /** Display label of the source; falls back to the raw source. */
  sourceLabel?: string;
  date:         string;
  name:         string;
  itemCount:    number;
}

const props = withDefaults(defineProps<{
  rows:          AnnouncementListRow[];
  /** Source filter options; the first entry is the show-all option. */
  sourceOptions: { label: string, value: string }[];
  /** Route prefix of the announcement detail pages. */
  detailBase?:   string;
  /** Tone of the source pill. */
  sourceTone?:   'blue' | 'purple' | 'neutral';
}>(), {
  detailBase: '/announcement',
  sourceTone: 'blue',
});

const selectedSource = ref(props.sourceOptions[0]?.value ?? 'all');

const filtered = computed(() =>
  selectedSource.value === 'all'
    ? props.rows
    : props.rows.filter((row: AnnouncementListRow) => row.source === selectedSource.value));

const SOURCE_PILL_CLASS: Record<string, string> = {
  blue:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  purple:  'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const sourcePillClass = computed(() => {
  const tone = props.sourceTone as string | undefined;
  return SOURCE_PILL_CLASS[tone ?? 'blue'] ?? '';
});

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const { locale } = useI18n();

const monthGroups = computed(() => {
  const groups = new Map<string, AnnouncementListRow[]>();
  for (const row of filtered.value) {
    const key = row.date.slice(0, 7);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    label: monthLabel(key),
    rows,
  }));
});

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return locale.value === 'en'
    ? `${MONTHS_EN[m! - 1]} ${y}`
    : `${y}年${m!}月`;
}
</script>
