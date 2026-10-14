<template>
  <div class="mx-auto max-w-275 px-4 pt-2 pb-6">
    <UCard>
      <AnnouncementList :rows="rows" :source-options="sourceOptions">
        <template #header>
          <h1 class="text-xl font-bold">{{ $t('magic.announcement.$self') }}</h1>
        </template>
      </AnnouncementList>
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
}

definePageMeta({
  layout: 'main',
  title:  'Announcements',
});

const { $orpc } = useNuxtApp();
const { t } = useI18n();

const { data: announcements } = useAsyncData('magic-announcements', () => {
  return $orpc.magic.announcement.list({}) as Promise<AnnouncementListRow[]>;
}, { default: () => [] });

const rows = computed(() => announcements.value);

const sourceOptions = computed(() => {
  const sources = [...new Set(rows.value.map(row => row.source))].sort();
  return [
    { label: t('magic.announcement.sourceAll'), value: 'all' },
    ...sources.map(source => ({ label: source, value: source })),
  ];
});
</script>
