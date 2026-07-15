<template>
  <div class="container mx-auto px-4 pt-2 pb-6">
    <div class="flex items-center gap-4 mb-6">
      <h1 class="text-2xl font-bold">{{ $t('hearthstone.timeline.$self') }}</h1>
      <USelect
        :model-value="format"
        :items="formatOptions"
        size="sm"
        class="w-48"
        @update:model-value="(v: string) => navigateTo(`/timeline/${v}`)"
      />
    </div>

    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="text-2xl animate-spin" />
    </div>

    <div v-else-if="items.length === 0" class="text-center py-12 text-gray-500">
      {{ $t('hearthstone.timeline.empty') }}
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="item in items"
        :key="item.id"
        class="border-l-2 border-gray-200 dark:border-gray-700 pl-4 py-2"
      >
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500">{{ item.date }}</span>
          <TypeBadge :type="item.type" :status="item.status ?? undefined" />
          <span v-if="item.cardId" class="font-medium">{{ item.cardId }}</span>
          <span v-if="item.setId" class="font-medium">{{ item.setId }}</span>
          <span v-if="item.ruleId" class="font-medium">{{ item.ruleId }}</span>
        </div>
        <div v-if="item.name" class="text-sm mt-0.5">{{ item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { $orpc } = useNuxtApp();
const { t } = useI18n();
const route = useRoute();

const format = computed(() => route.params.format as string);

const formatOptions = [
  { label: 'Standard', value: 'standard' },
  { label: 'Wild', value: 'wild' },
  { label: 'Twist', value: 'twist' },
  { label: 'Battlegrounds', value: 'battlegrounds' },
  { label: 'Mercenaries', value: 'mercenaries' },
];

definePageMeta({
  layout: 'main',
  title:  'Timeline',
});

useTitle(() => `${t('hearthstone.timeline.$self')} - ${format.value}`);

const { data: items, pending } = useAsyncData(`timeline-${format.value}`, () => {
  return $orpc.hearthstone.announcement.timeline({ format: format.value }) as Promise<Array<{
    id: string;
    date: string;
    name: string;
    type: string;
    cardId: string | null;
    setId: string | null;
    ruleId: string | null;
    status: string | null;
  }>>;
}, { default: () => [], watch: [format] });

</script>
