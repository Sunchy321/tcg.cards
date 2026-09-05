<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-globe" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">Gatherer 卡图爬取</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            按系列从 Gatherer 抓取卡图,质量不做保证,导入后按实测分档(可能大量 lowres,可手动替换)。
          </p>
        </div>
      </div>
    </div>

    <div class="grid gap-4">
      <TaskController
        title="Gatherer 卡图爬取"
        :operations="[operation]"
        @completed="onCompleted"
      >
        <template #params="{ disabled }">
          <div class="space-y-4 pt-4">
            <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="系列" required class="min-w-64">
                <UInputMenu
                  v-model="form.set"
                  :items="setOptions"
                  :loading="loadingSets"
                  placeholder="系列代码(如 dmu)"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  :disabled="disabled"
                />
              </UFormField>
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="语言">
                <USelect
                  v-model="form.lang"
                  :items="langOptions"
                  value-key="value"
                  placeholder="不限"
                  class="w-40"
                  :disabled="disabled"
                />
              </UFormField>
            </div>
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

definePageMeta({ layout: 'admin', title: 'Gatherer 卡图爬取' });

const form = useLocalPersist('magic-image-import:gatherer', { set: '__all__', lang: '__all__' as string });

if (typeof form.set !== 'string') form.set = '__all__';
if (typeof form.lang !== 'string') form.lang = '__all__';

const LANG_OPTIONS = [
  { label: '不限', value: '__all__' },
  { label: 'EN', value: 'en' },
  { label: 'ZHS', value: 'zhs' },
  { label: 'ZHT', value: 'zht' },
  { label: 'JA', value: 'ja' },
  { label: 'DE', value: 'de' },
  { label: 'FR', value: 'fr' },
  { label: 'ES', value: 'es' },
  { label: 'IT', value: 'it' },
  { label: 'PT', value: 'pt' },
  { label: 'RU', value: 'ru' },
  { label: 'KO', value: 'ko' },
];
const langOptions = LANG_OPTIONS;
const setOptions = ref<string[]>([]);
const loadingSets = ref(false);
const taskResult = ref<Record<string, unknown> | null>(null);

onMounted(async () => {
  loadingSets.value = true;
  try {
    const list = await orpc.magic.images.sets({});
    setOptions.value = list.map(x => x.code);
    form.set = list[0]!.code;
  } finally {
    loadingSets.value = false;
  }
});

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}

const operation = computed<TaskOperation>(() => ({
  key:      'gatherer',
  label:    '开始爬取',
  icon:     'i-lucide-play',
  disabled: !form.set.trim(),
  create:   async () => orpc.magic.createTask.gathererImageImport({
    set:  form.set.trim(),
    lang: form.lang && form.lang !== '__all__' ? form.lang : undefined,
  }) as Promise<TaskPageSnapshot>,
}));
</script>
