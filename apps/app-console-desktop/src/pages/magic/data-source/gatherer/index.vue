<template>
  <MagicSourceImportPage
    title="Gatherer 爬取"
    icon="i-lucide-globe"
    description="按 multiverseId 连续区间爬取 Gatherer 卡页数据。"
    task-title="Gatherer 爬取"
    :operation="operation"
  >
    <template #params="{ disabled }">
      <div class="space-y-4 pt-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-2">
            <label class="text-sm font-medium text-default">级别</label>
            <USelect v-model="form.level" :items="gathererLevels" :disabled="disabled" class="w-full" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-default">并发数</label>
            <UInput v-model.number="form.concurrency" type="number" min="1" max="16" :disabled="disabled" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-default">From（可选）</label>
            <UInput v-model.number="form.from" type="number" min="0" :disabled="disabled" placeholder="默认 0" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-medium text-default">To（可选）</label>
            <UInput v-model.number="form.to" type="number" min="0" :disabled="disabled" placeholder="默认最大值" />
          </div>
        </div>
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: 'Gatherer 爬取' });

const form = reactive({ level: 'refresh', from: null as number | null, to: null as number | null, concurrency: 4 });

const gathererLevels = [
  { label: 'fill（补缺）', value: 'fill' },
  { label: 'refresh（刷新过期）', value: 'refresh' },
  { label: 'refresh_all（刷新全部）', value: 'refresh_all' },
  { label: 'force（强制重抓）', value: 'force' },
];

const operation = computed<TaskOperation>(() => ({
  key:      'gatherer',
  label:    '爬取 Gatherer',
  icon:     'i-lucide-play',
  disabled: false,
  create:   async () => orpc.magic.createTask.gathererImport({
    level:       form.level as 'fill' | 'refresh' | 'refresh_all' | 'force',
    from:        form.from ?? undefined,
    to:          form.to ?? undefined,
    concurrency: form.concurrency,
  }) as Promise<TaskPageSnapshot>,
}));
</script>
