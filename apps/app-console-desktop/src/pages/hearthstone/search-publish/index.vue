<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <UCard>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-database" class="size-5 text-primary" />
          <h1 class="text-xl font-semibold">远程搜索库发布</h1>
        </div>
        <PublishTargetPicker
          game-label="hearthstone"
          :targets="targets"
          :selected="selected"
          :disabled="targetLocked"
          @select="select"
          @reload="reload"
        />
      </div>
      <p class="mt-2 text-sm text-muted">
        从本地数据库导出搜索数据。选择账户目标时，可以更新远程搜索库，导出的搜索数据包会上传供桌面端下载。
      </p>
    </UCard>

    <UAlert
      v-if="!databaseConfigured"
      color="warning"
      variant="soft"
      icon="i-lucide-database"
      title="未配置本地数据库"
      description="请在 设置 → 数据库 中填写连接字符串。"
    />
    <UAlert
      v-else-if="!direct && !loggedIn"
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
      title="未配置发布目标"
      description="请在 设置 → 发布配置 中添加一个发布目标。"
    />
    <UAlert
      v-else-if="exportDirectory === ''"
      color="warning"
      variant="soft"
      icon="i-lucide-folder-x"
      title="未配置搜索数据导出目录"
      description="请在 设置 → 发布配置 的搜索数据存储中先配置导出目录。"
    />

    <TaskController ref="controller" title="搜索数据" :operations="operations">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UCheckbox
          v-if="selected?.kind === 'account'"
          v-model="updateD1"
          :disabled="targetLocked"
          label="更新远程搜索库（D1）"
        />
        <p class="text-sm text-muted">导出目录：{{ exportDirectory === '' ? '未配置' : exportDirectory }}</p>
      </div>
      <p v-if="outputDirectory" class="text-sm text-muted">文件位置：{{ outputDirectory }}</p>
      <UAlert v-if="error" role="alert" color="error" :description="error" class="mt-4" />
    </TaskController>
  </div>
</template>
<script setup lang="ts">
import PublishTargetPicker from '~/components/PublishTargetPicker.vue';
import { useSearchD1Publish } from '~/composables/useSearchD1Publish';

definePageMeta({ layout: 'admin', title: '远程搜索库发布' });

const { controller, error, direct, databaseConfigured, loggedIn, exportDirectory, outputDirectory, operations, targets, selected, select, reload, targetLocked, updateD1 } = useSearchD1Publish('hearthstone');
</script>
