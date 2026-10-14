<template>
  <div>
    <div class="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 rounded-t-2xl border-b border-gray-200 bg-white px-5 py-6 sm:px-8 sm:py-7 dark:border-gray-800 dark:bg-gray-900">
      <div class="flex items-center gap-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-300" aria-hidden="true">
          <UIcon name="lucide:newspaper" class="size-5" />
        </span>
        <slot name="header" />
      </div>
      <USelect
        v-if="sourceOptions.length > 1"
        v-model="selectedSource"
        :items="sourceOptions"
        size="lg"
        class="w-full sm:w-72"
        :aria-label="sourceOptions[0]?.label"
      />
    </div>

    <div v-if="filtered.length === 0" class="px-5 py-16 text-center text-gray-500">
      {{ $t('announcement.empty') }}
    </div>

    <div v-else class="space-y-6 px-3 py-5 sm:px-6 sm:py-6">
      <div v-for="group in monthGroups" :key="group.key">
        <h2 class="mb-1 flex items-center gap-4 px-2 text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400">
          <span class="shrink-0">{{ group.label }}</span>
          <span class="h-px flex-1 bg-gray-100 dark:bg-gray-800" aria-hidden="true" />
        </h2>
        <div>
          <NuxtLink
            v-for="row in group.rows"
            :key="row.id"
            :to="`${detailBase}/${row.id}`"
            class="group grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-4 transition-colors hover:bg-primary-50/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-5 dark:hover:bg-primary-500/10"
          >
            <time :datetime="row.date" :aria-label="row.date" class="flex flex-col items-center gap-0.5 border-r border-gray-200 pr-3 tabular-nums sm:pr-5 dark:border-gray-800">
              <span class="text-2xl font-medium leading-none tracking-tight text-gray-700 sm:text-3xl dark:text-gray-200">{{ row.date.slice(8, 10) }}</span>
              <span class="mt-1 text-[10px] font-medium text-gray-400 sm:text-xs dark:text-gray-500">{{ row.date.slice(0, 7).replace('-', '.') }}</span>
            </time>
            <div class="min-w-0 space-y-2">
              <span class="block text-sm leading-6 font-semibold wrap-anywhere text-gray-800 transition-colors group-hover:text-primary-700 sm:text-base dark:text-gray-100 dark:group-hover:text-primary-300">{{ row.name }}</span>
              <span class="inline-flex rounded-md px-2 py-0.5 text-[11px] leading-4 font-medium" :class="sourcePillClass">{{ row.sourceLabel ?? row.source }}</span>
            </div>
            <div class="flex items-center gap-4 pl-1">
              <span class="flex min-w-7 flex-col items-end gap-0.5 tabular-nums">
                <span class="text-base font-medium text-gray-600 dark:text-gray-300">{{ row.itemCount }}</span>
                <span class="text-[10px] text-gray-400 dark:text-gray-500">{{ $t('announcement.itemCountUnit') }}</span>
              </span>
              <UIcon name="lucide:arrow-up-right" class="hidden size-4 text-gray-300 transition-colors group-hover:text-primary-600 sm:block dark:text-gray-600 dark:group-hover:text-primary-300" aria-hidden="true" />
            </div>
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

/** Formats a month heading in the active language. */
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return locale.value === 'en'
    ? `${MONTHS_EN[m! - 1]} ${y}`
    : `${y}年${m!}月`;
}
</script>
