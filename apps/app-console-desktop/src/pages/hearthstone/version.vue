<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title: '版本管理',
});
</script>

<template>
  <div class="desktop-page">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-git-branch" class="size-5 text-primary" />
          <h1 class="text-lg font-semibold">版本管理</h1>
        </div>
      </template>
      <p class="text-sm text-muted">管理 Hearthstone 游戏版本和补丁信息。</p>
    </UCard>
  </div>
</template>
