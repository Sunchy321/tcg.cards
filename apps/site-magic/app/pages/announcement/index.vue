<template>
  <div class="mx-auto max-w-275 px-4 pt-6 pb-10 sm:pt-8">
    <UCard :ui="{ root: 'overflow-visible rounded-2xl', body: 'p-0 sm:p-0' }">
      <AnnouncementList :rows="rows" :source-options="sourceOptions" source-tone="purple">
        <template #header>
          <h1 class="text-2xl font-semibold tracking-tight">{{ $t('magic.announcement.$self') }}</h1>
        </template>
      </AnnouncementList>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useAnnouncementLabels } from '~/composables/useAnnouncementLabels';

/** One published announcement and its change count. */
interface AnnouncementListRow {
  id:        string;
  source:    string;
  date:      string;
  name:      string;
  itemCount: number;
}

definePageMeta({
  layout: 'main',
  title:  'Announcements',
});

const { $orpc } = useNuxtApp();
const { t } = useI18n();
const { sourceLabel, announcementTitle } = useAnnouncementLabels();

const { data: announcements } = useAsyncData('magic-announcements', () => {
  return $orpc.magic.announcement.list({}) as Promise<AnnouncementListRow[]>;
}, { default: () => [] });

const rows = computed(() => announcements.value.map(row => ({
  ...row,
  sourceLabel: sourceLabel(row.source),
  name:        announcementTitle(row),
})));

const sourceOptions = computed(() => {
  const sources = [...new Set(rows.value.map(row => row.source))].sort();
  return [
    { label: t('magic.announcement.sourceAll'), value: 'all' },
    ...sources.map(source => ({ label: sourceLabel(source), value: source })),
  ];
});
</script>
