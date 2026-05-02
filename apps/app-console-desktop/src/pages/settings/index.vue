<script setup lang="ts">
import { currentAuthState } from '../../auth';

definePageMeta({
  title: '设置',
});
</script>

<template>
  <div class="desktop-page">
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="desktop-section-title">
        设置
      </h1>
      <div class="desktop-panel space-y-4 p-6">
        <div>
          <p class="text-sm font-medium text-default">当前账号</p>
          <p class="mt-2 text-sm text-default">
            {{ currentAuthState?.user.name ?? '—' }}
          </p>
          <p class="mt-2 text-xs text-muted">
            服务器连接由桌面应用内部管理，不在前端界面中暴露。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
