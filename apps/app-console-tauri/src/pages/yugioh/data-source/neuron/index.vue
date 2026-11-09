<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-globe" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">Neuron 官方库爬取</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            从游戏王官方卡片数据库（Neuron）逐卡抓取各语言卡文与收录数据，缓存于本地。
          </p>
        </div>
      </div>
    </div>

    <UAlert
      v-if="createError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="createError"
    />

    <div class="grid gap-4">
      <TaskController
        title="Neuron 官方库爬取"
        :operations="[operation]"
        @completed="onCompleted"
        @failed="onFailed"
        @create-error="onCreateError"
      >
        <template #params="{ disabled }">
          <div class="grid gap-4 pt-4 xl:grid-cols-4">
            <UFormField label="级别" orientation="horizontal" class="flex-1" :ui="formFieldUi">
              <USelect v-model="form.level" :items="levelItems" :disabled="disabled" class="w-full" />
            </UFormField>
            <UFormField label="语言" orientation="horizontal" class="flex-1" :ui="formFieldUi">
              <USelect v-model="form.locales" :items="localeItems" :disabled="disabled" class="w-full" />
            </UFormField>
            <UFormField label="并发数" orientation="horizontal" class="flex-1" :ui="formFieldUi">
              <UInputNumber v-model="form.concurrency" :min="1" :max="8" :disabled="disabled" class="w-full" />
            </UFormField>
            <UFormField label="请求间隔 (ms)" orientation="horizontal" class="flex-1" :ui="formFieldUi">
              <UInputNumber v-model="form.delayMs" :min="50" :max="5000" :step="50" :disabled="disabled" class="w-full" />
            </UFormField>
          </div>
        </template>
      </TaskController>

      <TaskResultCard :result="taskResult" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: 'Neuron 官方库爬取' });

type KonamiLevel = 'fill' | 'refresh' | 'refresh_all' | 'force';
type LocaleChoice = 'all' | 'ja' | 'en' | 'ae' | 'ko' | 'fr' | 'de' | 'it' | 'es' | 'pt';

interface NeuronForm {
  level:       KonamiLevel;
  locales:     LocaleChoice;
  concurrency: number;
  delayMs:     number;
}

/** Persists the crawl parameters so the page reopens with the last-used values. */
const STATE_KEY = 'console-desktop-yugioh-neuron-page';

function loadForm(): NeuronForm {
  try {
    const r = localStorage.getItem(STATE_KEY);
    if (r) return JSON.parse(r) as NeuronForm;
  } catch { /* ignore corrupted state */ }
  return { level: 'refresh', locales: 'all', concurrency: 1, delayMs: 800 };
}

function saveForm() {
  localStorage.setItem(STATE_KEY, JSON.stringify(form));
}

const form = reactive<NeuronForm>(loadForm());
watch(form, saveForm, { deep: true });

/** Horizontal form fields: label next to the control with a small gap, control fills the rest. */
const formFieldUi = { root: 'flex items-center gap-3', container: 'relative flex-1' };

const levelItems: { label: string, value: KonamiLevel }[] = [
  { label: 'fill（补缺）', value: 'fill' },
  { label: 'refresh（刷新过期）', value: 'refresh' },
  { label: 'refresh_all（刷新全部）', value: 'refresh_all' },
  { label: 'force（强制重抓）', value: 'force' },
];

const localeItems: { label: string, value: LocaleChoice }[] = [
  { label: '全部', value: 'all' },
  { label: '日本語（ja）', value: 'ja' },
  { label: 'English（en）', value: 'en' },
  { label: 'English (Asia)（ae）', value: 'ae' },
  { label: '한글（ko）', value: 'ko' },
  { label: 'Français（fr）', value: 'fr' },
  { label: 'Deutsch（de）', value: 'de' },
  { label: 'Italiano（it）', value: 'it' },
  { label: 'Español（es）', value: 'es' },
  { label: 'Português（pt）', value: 'pt' },
];

const createError = ref('');
const taskResult = ref<Record<string, unknown> | null>(null);

const operation = computed<TaskOperation>(() => ({
  key:      'neuron',
  label:    '爬取 Neuron',
  icon:     'i-lucide-play',
  disabled: false,
  create:   async () => orpc.yugioh.createTask.neuronImport({
    level:       form.level,
    locales:     form.locales === 'all' ? undefined : [form.locales],
    concurrency: form.concurrency,
    delayMs:     form.delayMs,
  }) as Promise<TaskPageSnapshot>,
}));

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}
function onFailed() {}
function onCreateError(_opKey: string, message: string) {
  createError.value = message;
}
</script>
