<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-lg font-semibold">赛制管理</h2>
      <UButton icon="i-lucide-plus" label="新增赛制" />
    </div>

    <UCard>
      <p class="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
        暂无数据
      </p>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title:  '赛制管理',
});
</script>
