<template>
  <div class="mx-auto max-w-275 px-4 pt-2 pb-6">
    <UCard>
      <div class="mb-4 flex items-center justify-between gap-3">
        <h1 class="text-xl font-bold">{{ $t('hearthstone.announcement.$self') }}</h1>
        <USelect
          v-model="selectedSource"
          :items="sourceOptions"
          size="sm"
          class="w-40"
        />
      </div>

      <div v-if="pending" class="flex justify-center py-12">
        <UIcon name="lucide:loader" class="text-2xl animate-spin" />
      </div>

      <div v-else-if="filtered.length === 0" class="text-center py-12 text-gray-500">
        {{ $t('hearthstone.announcement.empty') }}
      </div>

      <div v-else class="space-y-6">
        <div v-for="group in monthGroups" :key="group.key">
          <h2 class="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            {{ group.label }}
          </h2>
          <div class="divide-y divide-gray-100 dark:divide-gray-800">
            <NuxtLink
              v-for="a in group.items"
              :key="a.id"
              :to="`/announcement/${a.id}`"
              class="flex cursor-pointer items-center gap-4 py-3 transition hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span class="w-24 shrink-0 truncate text-lg font-semibold">{{ a.name }}</span>
              <span :class="sourceClass(a.source)">{{ sourceLabel(a.source) }}</span>
              <div class="flex-1" />
              <span class="shrink-0 font-mono text-sm text-gray-500 dark:text-gray-400">{{ a.date }}</span>
              <span class="w-24 shrink-0 text-right">
                <span class="font-medium">{{ a.itemCount }}</span>
                <span class="ml-1 text-xs text-gray-400 dark:text-gray-500">{{ $t('hearthstone.announcement.itemCountUnit') }}</span>
              </span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
interface AnnouncementListRow {
  id:        string;
  source:    string;
  date:      string;
  name:      string;
  itemCount: number;
  formats:   string[];
}

const { $orpc } = useNuxtApp();
const { t, te, locale } = useI18n();

definePageMeta({
  layout: 'main',
  title:  'Announcements',
});

useTitle(t('hearthstone.announcement.$self'));

const { data: announcements, pending } = useAsyncData('announcements', () => {
  return $orpc.hearthstone.announcement.list({}) as Promise<AnnouncementListRow[]>;
}, { default: () => [] });

const selectedSource = ref<'all' | 'blizzard' | 'release'>('all');

const sourceOptions = computed(() => [
  { label: t('hearthstone.announcement.sourceAll'), value: 'all' },
  { label: t('hearthstone.announcement.sourceBlizzard'), value: 'blizzard' },
  { label: t('hearthstone.announcement.sourceRelease'), value: 'release' },
]);

const filtered = computed(() =>
  selectedSource.value === 'all'
    ? announcements.value
    : announcements.value.filter(a => a.source === selectedSource.value),
);

const sourceLabel = (source: string) => {
  const key = `hearthstone.announcement.source${source[0]?.toUpperCase()}${source.slice(1)}`;
  return te(key) ? t(key) : source;
};

const sourceClass = (source: string) => source === 'release'
  ? 'rounded px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
  : 'rounded px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const monthGroups = computed(() => {
  const groups = new Map<string, AnnouncementListRow[]>();
  for (const a of filtered.value) {
    const key = a.date.slice(0, 7);
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: groupLabel(key),
    items,
  }));
});

const groupLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return locale.value === 'en'
    ? `${MONTHS_EN[m! - 1]} ${y}`
    : `${y}年${m}月`;
};
</script>
