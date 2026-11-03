<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <UCard>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-database" class="size-5 text-primary" />
        <h1 class="text-xl font-semibold">远程搜索库发布</h1>
        <span class="text-sm text-muted">万智牌</span>
      </div>
      <p class="mt-2 text-sm text-muted">
        把已导出的搜索数据装载到网站使用的远程搜索库。装载分段进行，中断后可从断点继续；装载期间网站搜索自动改用原有数据库。
      </p>
    </UCard>

    <UAlert
      v-if="!loggedIn"
      color="warning"
      variant="soft"
      icon="i-lucide-log-in"
      title="此操作需要先登录控制台服务"
      description="请在 设置 → 远端登录 中登录后返回本页。"
    />
    <UAlert
      v-else-if="exportDirectory === ''"
      color="warning"
      variant="soft"
      icon="i-lucide-folder-x"
      title="未配置搜索数据导出目录"
      description="请在 设置 → 发布配置 的搜索数据存储中先配置导出目录。"
    />

    <UCard>
      <template #header>
        <div class="space-y-1">
          <h2 class="font-medium">装载搜索数据</h2>
          <p class="text-sm text-muted">导出目录：{{ exportDirectory === '' ? '未配置' : exportDirectory }}</p>
        </div>
      </template>
      <UAlert v-if="error" role="alert" color="error" :description="error" class="mb-4" />
      <TaskItem v-if="task" :task="task" />
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="!task || isTaskTerminal(task)"
          label="发布到远程搜索库"
          icon="i-lucide-database"
          :loading="busy"
          :disabled="!canStart"
          @click="start"
        />
        <UButton
          v-if="task && ['failed', 'canceled', 'abandoned'].includes(task.status)"
          label="重试"
          variant="soft"
          :loading="busy"
          @click="retryLoad(task)"
        />
        <UButton
          v-if="task && ['pending', 'running', 'pausing', 'paused', 'resuming', 'interrupted'].includes(task.status)"
          label="取消"
          color="error"
          variant="soft"
          :loading="busy"
          @click="cancelLoad(task)"
        />
      </div>
    </UCard>
  </div>
</template>
<script setup lang="ts">
import { useSearchD1Publish } from '~/composables/useSearchD1Publish';
import type { TaskView } from '../../../../electron/contract';

definePageMeta({ layout: 'admin', title: '远程搜索库发布' });
const {
  task,
  error,
  busy,
  loggedIn,
  exportDirectory,
  canStart,
  start,
  retryLoad,
  cancelLoad,
} = useSearchD1Publish('magic');

/** Keeps completed runs available for inspection while allowing another release. */
function isTaskTerminal(active: TaskView) {
  return ['completed', 'failed', 'canceled', 'abandoned'].includes(active.status);
}
</script>
