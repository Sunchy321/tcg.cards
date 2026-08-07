<template>
  <div class="container mx-auto px-4 pt-2 pb-6">
    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="text-2xl animate-spin" />
    </div>

    <div v-else-if="announcements.length === 0" class="text-center py-12 text-gray-500">
      {{ $t('hearthstone.announcement.empty') }}
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="a in announcements"
        :key="a.id"
        class="cursor-pointer rounded-lg border border-slate-400/30 bg-slate-900/70 p-4 text-white transition hover:border-amber-400/70 hover:bg-slate-800/85"
        @click="navigateTo(`/announcement/${a.id}`)"
      >
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">{{ a.name }}</h2>
            <span class="text-sm text-slate-400">{{ a.source }}</span>
          </div>
          <span class="text-sm text-slate-400">{{ a.date }}</span>
        </div>
      </div>
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
