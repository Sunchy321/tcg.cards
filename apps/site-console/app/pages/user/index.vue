<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-lg font-semibold">用户管理</h2>
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
  title:  '用户管理',
});
</script>
