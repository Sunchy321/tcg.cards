<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title: '拆包导入',
});
</script>

<template>
  <div class="desktop-page">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-package-open" class="size-5 text-primary" />
          <h1 class="text-lg font-semibold">拆包导入</h1>
        </div>
      </template>
      <p class="text-sm text-muted">从 Unity dbf.unity3d 拆包数据导入卡牌附加信息。</p>
    </UCard>
  </div>
</template>
