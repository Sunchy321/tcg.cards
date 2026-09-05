<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-download" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">Scryfall 卡图导入</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            抓取 Scryfall 官方 png(745×1040)并转 q50 webp;质量按细节损失率分档;跳过手动替换过的印张。
          </p>
        </div>
      </div>
    </div>

    <div class="grid gap-4">
      <TaskController
        title="Scryfall 卡图导入"
        :operations="[operation]"
        @completed="onCompleted"
      >
        <template #params="{ disabled }">
          <div class="space-y-4 pt-4">
            <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
              <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }" label="系列">
                <UInputMenu
                  v-model="form.set"
                  :items="setItems"
                  value-key="value"
                  :loading="loadingSets"
                  placeholder="系列代码(如 dmu)"
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  class="w-56"
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
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: 'Scryfall 卡图导入' });

const form = useLocalPersist('magic-image-import:scryfall', { set: '__all__' as string, lang: '__all__' as string, force: false, cleanupJpg: false });
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

/** First item '__all__' means no set filter (full import). */
const setItems = computed(() => [
  { label: '不限(全量)', value: '__all__' },
  ...setOptions.value.map(code => ({ label: code, value: code })),
]);

onMounted(async () => {
  loadingSets.value = true;
  try {
    const list = await orpc.magic.images.sets({});
    setOptions.value = list.map(x => x.code);
  } finally {
    loadingSets.value = false;
  }
});

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}

const operation = computed<TaskOperation>(() => ({
  key:      'scryfall',
  label:    '开始导入',
  icon:     'i-lucide-play',
  disabled: false,
  create:   async () => orpc.magic.createTask.scryfallImageImport({
    scope: form.set === '__all__' ? 'full' : 'set',
    set:   form.set === '__all__' ? undefined : form.set,
    lang:  form.lang === '__all__' ? undefined : form.lang,
    force: !!form.force,
    cleanupJpg: !!form.cleanupJpg,
  }) as Promise<TaskPageSnapshot>,
}));
</script>
