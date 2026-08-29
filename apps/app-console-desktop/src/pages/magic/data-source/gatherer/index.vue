<template>
  <MagicSourceImportPage
    title="Gatherer 爬取"
    icon="i-lucide-globe"
    description="按 multiverseId 连续区间爬取 Gatherer 卡页数据。"
    task-title="Gatherer 爬取"
    :operation="operation"
  >
    <template #params="{ disabled }">
      <div class="grid gap-4 pt-4 xl:grid-cols-4">
        <UFormField label="级别" orientation="horizontal" class="flex-1" :ui="formFieldUi">
          <USelect v-model="form.level" :items="gathererLevels" :disabled="disabled" class="w-full" />
        </UFormField>
        <UFormField label="并发数" orientation="horizontal" class="flex-1" :ui="formFieldUi">
          <UInputNumber v-model="form.concurrency" :min="1" :max="16" :disabled="disabled" class="w-full" />
        </UFormField>
        <UFormField label="From" orientation="horizontal" class="flex-1" :ui="formFieldUi">
          <UInputNumber v-model="form.from" :min="0" :disabled="disabled" placeholder="默认 0" class="w-full" />
        </UFormField>
        <UFormField label="To" orientation="horizontal" class="flex-1" :ui="formFieldUi">
          <UInputNumber v-model="form.to" :min="0" :disabled="disabled" placeholder="默认最大值" class="w-full" />
        </UFormField>
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

/** Horizontal form fields: label next to the control with a small gap, control fills the rest. */
const formFieldUi = { root: 'flex items-center gap-3', container: 'relative flex-1' };

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
