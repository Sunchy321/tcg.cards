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
              <UCheckbox v-model="form.force" label="Force" :disabled="disabled" />
              <UCheckbox v-model="form.cleanupJpg" label="清理 JPG" :disabled="disabled" />
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
import { locale, mainLocale } from '@tcg-cards/model/magic/schema/basic';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: 'Gatherer 卡图爬取' });

const form = useLocalPersist('magic-image-import:gatherer', { set: '', lang: '__all__' as string, force: false, cleanupJpg: false });

if (typeof form.set !== 'string') form.set = '';
if (typeof form.lang !== 'string') form.lang = '__all__';

/** Main locales first, then a separator and the remaining (secondary) locales. */
const mainCodeSet = new Set<string>(mainLocale.options);
const LANG_OPTIONS = [
  { label: '不限', value: '__all__' },
  ...mainLocale.options.map(code => ({ label: code.toUpperCase(), value: code })),
  { type: 'separator' },
  ...locale.options.filter(code => !mainCodeSet.has(code)).map(code => ({ label: code.toUpperCase(), value: code })),
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
    // Keep the persisted selection when still valid; only fall back to the first set otherwise.
    if (!setOptions.value.includes(form.set)) {
      form.set = list[0]!.code;
    }
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
    lang: form.lang === '__all__' ? undefined : form.lang,
    force: !!form.force,
    cleanupJpg: !!form.cleanupJpg,
  }) as Promise<TaskPageSnapshot>,
}));
</script>
