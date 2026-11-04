<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <UCard>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-database" class="size-5 text-primary" />
          <h1 class="text-xl font-semibold">远程搜索库发布</h1>
        </div>
        <PublishTargetPicker
          :targets="targets"
          :selected="selected"
          :disabled="targetLocked"
          @select="select"
          @reload="reload"
        />
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
      v-else-if="!selected"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="未配置账户发布目标"
      description="请在 设置 → 发布配置 中添加一个账户发布目标。"
    />
    <UAlert
      v-else-if="exportDirectory === ''"
      color="warning"
      variant="soft"
      icon="i-lucide-folder-x"
      title="未配置搜索数据导出目录"
      description="请在 设置 → 发布配置 的搜索数据存储中先配置导出目录。"
    />

    <TaskController ref="controller" title="装载搜索数据" :operations="operations">
      <p class="text-sm text-muted">导出目录：{{ exportDirectory === '' ? '未配置' : exportDirectory }}</p>
      <UAlert v-if="error" role="alert" color="error" :description="error" class="mt-4" />
    </TaskController>
  </div>
</template>
<script setup lang="ts">
import { useSearchD1Publish } from '~/composables/useSearchD1Publish';

definePageMeta({ layout: 'admin', title: '远程搜索库发布' });

const { controller, error, loggedIn, exportDirectory, operations, targets, selected, select, reload, targetLocked } = useSearchD1Publish('magic');
</script>
