<template>
  <div class="space-y-6">
    <!-- Stats row -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard
        v-for="stat in stats"
        :key="stat.label"
      >
        <div class="flex items-center gap-4">
          <div class="rounded-lg bg-primary/10 p-3">
            <UIcon :name="stat.icon" class="size-5 text-primary" />
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ stat.label }}</p>
            <p class="text-2xl font-semibold">{{ stat.value }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Recent activity -->
    <UCard>
      <template #header>
        <h2 class="text-sm font-semibold">最近活动</h2>
      </template>
      <p class="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        暂无数据
      </p>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title:  '概览',
});

const stats = [
  { label: '卡牌总数', icon: 'i-lucide-layers', value: '—' },
  { label: '系列数量', icon: 'i-lucide-folder-open', value: '—' },
  { label: '赛制数量', icon: 'i-lucide-shield-check', value: '—' },
];
</script>
