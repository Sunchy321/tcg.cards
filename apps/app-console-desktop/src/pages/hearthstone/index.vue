<template>
  <div class="flex-1 overflow-y-auto p-6">
    <div class="space-y-4">
      <h1 class="text-lg font-semibold text-slate-900">Hearthstone — 概览</h1>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <UCard v-for="item in items" :key="item.label">
          <div class="flex items-center gap-3">
            <div class="rounded-lg bg-primary-50 p-2.5">
              <UIcon :name="item.icon" class="size-5 text-primary-600" />
            </div>
            <div>
              <p class="text-xs text-slate-500">{{ item.label }}</p>
              <p class="text-xl font-semibold text-slate-900">—</p>
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const items = [
  { label: '卡牌总数', icon: 'i-lucide-layers' },
  { label: '系列数量', icon: 'i-lucide-folder-open' },
  { label: '赛制数量', icon: 'i-lucide-shield-check' },
  { label: '标签数量', icon: 'i-lucide-tags' },
];
</script>
