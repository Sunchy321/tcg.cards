<template>
  <MagicSourceImportPage
    title="Gatherer 爬取"
    icon="i-lucide-globe"
    description="按 Gatherer 卡牌编号范围获取卡牌资料。"
    task-title="Gatherer 爬取"
    :operation="operation"
    :result-labels="resultLabels"
  >
    <template #params="{ disabled }">
      <div class="grid gap-4 pt-4 xl:grid-cols-4">
        <UFormField label="级别" orientation="horizontal" class="flex-1" :ui="formFieldUi">
          <USelect v-model="form.level" :items="gathererLevels" :disabled="disabled" class="w-full" />
        </UFormField>
        <UFormField label="并发数" orientation="horizontal" class="flex-1" :ui="formFieldUi">
          <UInputNumber v-model="form.concurrency" :min="1" :max="16" :disabled="disabled" class="w-full" />
        </UFormField>
        <UFormField label="起始编号" orientation="horizontal" class="flex-1" :ui="formFieldUi">
          <UInputNumber v-model="form.from" :min="1" :disabled="disabled" placeholder="默认 1" class="w-full" />
        </UFormField>
        <UFormField label="结束编号" orientation="horizontal" class="flex-1" :ui="formFieldUi">
          <UInputNumber v-model="form.to" :min="1" :disabled="disabled" placeholder="默认最大值" class="w-full" />
        </UFormField>
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { startDesktopTask } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: 'Gatherer 爬取' });

type GathererLevel = 'fill' | 'refresh' | 'refresh_all' | 'force';

interface GathererForm {
  level:       GathererLevel;
  from:        number | null;
  to:          number | null;
  concurrency: number;
}

/** Persists the crawl parameters so the page reopens with the last-used values. */
const STATE_KEY = 'console-desktop-magic-gatherer-page';

function loadForm(): GathererForm {
  try {
    const r = localStorage.getItem(STATE_KEY);
    if (r) return JSON.parse(r) as GathererForm;
  } catch { /* ignore corrupted state */ }
  return { level: 'refresh', from: null, to: null, concurrency: 4 };
}

function saveForm() {
  localStorage.setItem(STATE_KEY, JSON.stringify(form));
}

const form = reactive<GathererForm>(loadForm());
watch(form, saveForm, { deep: true });
const resultLabels = {
  fresh: '资料有效', localMissing: '本地无对应卡牌', fetched: '已更新资料', notFound: '未找到卡牌', errors: '更新失败',
};

/** Horizontal form fields: label next to the control with a small gap, control fills the rest. */
const formFieldUi = { root: 'flex items-center gap-3', container: 'relative flex-1' };

const gathererLevels: { label: string, value: GathererLevel }[] = [
  { label: '补齐缺失资料', value: 'fill' },
  { label: '刷新过期资料', value: 'refresh' },
  { label: '更新全部资料', value: 'refresh_all' },
  { label: '重新抓取全部资料', value: 'force' },
];

const operation = computed<TaskOperation>(() => ({
  key:      'gatherer',
  taskType: 'magic_gatherer_import',
  label:    '爬取 Gatherer',
  icon:     'i-lucide-play',
  disabled: false,
  create:   async () => startDesktopTask('magic_gatherer_import', {
    level:       form.level,
    from:        form.from ?? undefined,
    to:          form.to ?? undefined,
    concurrency: form.concurrency,
  }),
}));
</script>
