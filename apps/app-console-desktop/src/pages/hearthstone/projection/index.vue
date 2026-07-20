<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title: '数据投影',
});
</script>

<template>
  <div class="desktop-page">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-box" class="size-5 text-primary" />
          <h1 class="text-lg font-semibold">数据投影</h1>
        </div>
      </template>
      <p class="text-sm text-muted">将 hsdata 原始数据投影到实体和本地化表中。</p>
    </UCard>
  </div>
</template>
