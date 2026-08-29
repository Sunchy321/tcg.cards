<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">Magic 数据源导入</h1>
          </div>
          <p class="mt-1 text-sm text-muted">从本地数据目录发现各来源文件，选择后执行导入。</p>
        </div>
        <div class="ml-auto flex gap-2">
          <UButton label="打开设置" icon="i-lucide-settings" color="neutral" variant="soft" to="/settings/games/magic" />
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
        </div>
      </div>
    </div>

    <UAlert v-if="dataState && !dataState.dataDir" color="warning" variant="soft" icon="i-lucide-folder-search">
      <template #description>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>尚未配置数据根，请在设置页配置后重新刷新。</span>
          <div class="sm:ml-auto">
            <UButton label="打开设置" icon="i-lucide-settings" color="warning" variant="soft" to="/settings/games/magic" />
          </div>
        </div>
      </template>
    </UAlert>

    <div class="grid gap-4 xl:grid-cols-3">
      <div class="xl:col-span-2">
        <TaskController
          title="Magic 数据导入"
          :multi-task="multiTaskItems"
          @completed="onCompleted"
          @failed="onFailed"
          @create-error="onCreateError"
        >
          <template #scryfall="{ disabled }">
            <div class="space-y-4 pt-4">
              <FileSelect v-model="scryfallForm.cards" label="Cards 文件" :files="scryfallFiles" :disabled="disabled" :required="true" />
              <FileSelect v-model="scryfallForm.sets" label="Sets 文件" :files="scryfallFiles" :disabled="disabled" />
              <FileSelect v-model="scryfallForm.rulings" label="Rulings 文件" :files="scryfallFiles" :disabled="disabled" />
            </div>
          </template>
          <template #mtgch="{ disabled }">
            <div class="space-y-4 pt-4">
              <div v-if="mtgchDir" class="text-xs text-muted">MTGCH 导出目录：{{ mtgchDir }}</div>
              <FileSelect v-model="mtgchForm.card" label="Card" :files="mtgchFiles" :disabled="disabled" />
              <FileSelect v-model="mtgchForm.oracle" label="Oracle" :files="mtgchFiles" :disabled="disabled" />
              <FileSelect v-model="mtgchForm.flavor" label="Flavor" :files="mtgchFiles" :disabled="disabled" />
              <FileSelect v-model="mtgchForm.ruling" label="Ruling" :files="mtgchFiles" :disabled="disabled" />
              <FileSelect v-model="mtgchForm.set" label="Set" :files="mtgchFiles" :disabled="disabled" />
              <FileSelect v-model="mtgchForm.type" label="Type" :files="mtgchFiles" :disabled="disabled" />
            </div>
          </template>
          <template #mtgjson="{ disabled }">
            <div class="space-y-4 pt-4">
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">MTGJSON set 目录</div>
                <div class="mt-1 font-mono text-sm">{{ mtgjsonDir ?? '未发现' }}</div>
              </div>
              <div class="text-xs text-muted">{{ mtgjsonFileCount > 0 ? `发现 ${mtgjsonFileCount} 个系列文件` : '目录中没有系列文件' }}</div>
            </div>
          </template>
          <template #gatherer="{ disabled }">
            <div class="space-y-4 pt-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <label class="text-sm font-medium text-default">级别</label>
                  <USelect v-model="gathererForm.level" :items="gathererLevels" :disabled="disabled" class="w-full" />
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium text-default">并发数</label>
                  <UInput v-model.number="gathererForm.concurrency" type="number" min="1" max="16" :disabled="disabled" />
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium text-default">From（可选）</label>
                  <UInput v-model.number="gathererForm.from" type="number" min="0" :disabled="disabled" placeholder="默认 0" />
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium text-default">To（可选）</label>
                  <UInput v-model.number="gathererForm.to" type="number" min="0" :disabled="disabled" placeholder="默认最大值" />
                </div>
              </div>
            </div>
          </template>
        </TaskController>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';
import { getMagicDataState, type MagicDataState } from '~/composables/useMagicData';

definePageMeta({ layout: 'admin', title: '数据源导入' });

const dataState = ref<MagicDataState | null>(null);
const loading = ref(false);

const scryfallForm = reactive({ cards: '', sets: '', rulings: '' });
const mtgchForm = reactive({ card: '', oracle: '', flavor: '', ruling: '', set: '', type: '' });
const gathererForm = reactive({ level: 'refresh', from: null as number | null, to: null as number | null, concurrency: 4 });

const gathererLevels = [
  { label: 'fill（补缺）', value: 'fill' },
  { label: 'refresh（刷新过期）', value: 'refresh' },
  { label: 'refresh_all（刷新全部）', value: 'refresh_all' },
  { label: 'force（强制重抓）', value: 'force' },
];

async function load() {
  loading.value = true;
  try {
    dataState.value = await getMagicDataState();
  } finally {
    loading.value = false;
  }
}

const scryfallFiles = computed(() => (dataState.value?.scryfall ?? []).map(f => ({ label: f.name, value: f.path })));
const mtgchDir = computed(() => dataState.value?.mtgch.dir ?? null);
const mtgchFiles = computed(() => (dataState.value?.mtgch.files ?? []).map(f => ({ label: f.name, value: f.path })));
const mtgjsonDir = computed(() => dataState.value?.mtgjson.dir ?? null);
const mtgjsonFileCount = computed(() => dataState.value?.mtgjson.fileCount ?? 0);

const scryfallOperation = computed<TaskOperation>(() => ({
  key:      'scryfall',
  label:    '导入 Scryfall',
  icon:     'i-lucide-play',
  disabled: scryfallForm.cards.trim().length === 0,
  create:   async () => orpc.magic.createTask.scryfallImport({
    cards:   scryfallForm.cards.trim() || undefined,
    sets:    scryfallForm.sets.trim() || undefined,
    rulings: scryfallForm.rulings.trim() || undefined,
  }) as Promise<TaskPageSnapshot>,
}));

const mtgchOperation = computed<TaskOperation>(() => ({
  key:      'mtgch',
  label:    '导入 MTGCH',
  icon:     'i-lucide-play',
  disabled: Object.values(mtgchForm).every(v => v.trim().length === 0),
  create:   async () => orpc.magic.createTask.mtgchImport({
    card:   mtgchForm.card.trim() || undefined,
    oracle: mtgchForm.oracle.trim() || undefined,
    flavor: mtgchForm.flavor.trim() || undefined,
    ruling: mtgchForm.ruling.trim() || undefined,
    set:    mtgchForm.set.trim() || undefined,
    type:   mtgchForm.type.trim() || undefined,
  }) as Promise<TaskPageSnapshot>,
}));

const mtgjsonOperation = computed<TaskOperation>(() => ({
  key:      'mtgjson',
  label:    '导入 MTGJSON',
  icon:     'i-lucide-play',
  disabled: mtgjsonDir.value == null,
  create:   async () => orpc.magic.createTask.mtgjsonImport({
    dir: mtgjsonDir.value!,
  }) as Promise<TaskPageSnapshot>,
}));

const gathererOperation = computed<TaskOperation>(() => ({
  key:      'gatherer',
  label:    '爬取 Gatherer',
  icon:     'i-lucide-play',
  disabled: false,
  create:   async () => orpc.magic.createTask.gathererImport({
    level:       gathererForm.level as 'fill' | 'refresh' | 'refresh_all' | 'force',
    from:        gathererForm.from ?? undefined,
    to:          gathererForm.to ?? undefined,
    concurrency: gathererForm.concurrency,
  }) as Promise<TaskPageSnapshot>,
}));

const multiTaskItems = computed(() => [
  { key: 'scryfall', label: 'Scryfall', icon: 'i-lucide-file-json', taskType: 'magic_scryfall_import', operation: scryfallOperation.value },
  { key: 'mtgch', label: 'MTGCH', icon: 'i-lucide-file-json', taskType: 'magic_mtgch_import', operation: mtgchOperation.value },
  { key: 'mtgjson', label: 'MTGJSON', icon: 'i-lucide-folder', taskType: 'magic_mtgjson_import', operation: mtgjsonOperation.value },
  { key: 'gatherer', label: 'Gatherer', icon: 'i-lucide-globe', taskType: 'magic_gatherer_import', operation: gathererOperation.value },
]);

function onCompleted() {
  load();
}
function onFailed() {}
function onCreateError() {}

onMounted(() => {
  void load();
});
</script>
