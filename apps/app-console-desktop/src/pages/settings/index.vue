<script setup lang="ts">
import { currentAuthState } from '../../auth';
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="text-lg font-semibold text-slate-900">
        设置
      </h1>
      <div class="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div>
          <p class="text-sm font-medium text-slate-700">当前账号</p>
          <p class="mt-2 text-sm text-slate-800">
            {{ currentAuthState?.user.name ?? '—' }}
          </p>
          <p class="mt-2 text-xs text-slate-500">
            服务器连接由桌面应用内部管理，不在前端界面中暴露。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
