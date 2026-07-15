<template>
  <div class="container mx-auto px-4 pt-2 pb-6">
    <h1 class="text-2xl font-bold mb-6">{{ $t('hearthstone.announcement.$self') }}</h1>

    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="text-2xl animate-spin" />
    </div>

    <div v-else-if="announcements.length === 0" class="text-center py-12 text-gray-500">
      {{ $t('hearthstone.announcement.empty') }}
    </div>

    <div v-else class="space-y-4">
      <UCard
        v-for="a in announcements"
        :key="a.id"
        class="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        @click="navigateTo(`/announcements/${a.id}`)"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">{{ a.name }}</h2>
            <span class="text-sm text-gray-500">{{ a.source }}</span>
          </div>
          <span class="text-sm text-gray-500">{{ a.date }}</span>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const { $orpc } = useNuxtApp();
const { t } = useI18n();

definePageMeta({
  layout: 'main',
  title:  'Announcements',
});

useTitle(t('hearthstone.announcement.$self'));

const { data: announcements, pending } = useAsyncData('announcements', () => {
  return $orpc.hearthstone.announcement.list({}) as Promise<{ id: string, source: string, date: string, name: string }[]>;
}, { default: () => [] });
</script>
