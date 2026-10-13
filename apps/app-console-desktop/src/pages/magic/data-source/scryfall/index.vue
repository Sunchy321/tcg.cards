<template>
  <MagicSourceImportPage
    title="Scryfall 导入"
    icon="i-lucide-download"
    description="从本地 Scryfall bulk 文件导入卡牌 / 裁定数据。"
    task-title="Scryfall 导入"
    :operation="operation"
  >
    <template #params="{ disabled, dataState }">
      <div class="grid gap-4 pt-4 xl:grid-cols-2">
        <FileSelect v-model="form.cards" label="Cards 文件" :files="scryfallFiles(dataState, 'all-cards')" :disabled="disabled" :required="true" />
        <FileSelect v-model="form.rulings" label="Rulings 文件" :files="scryfallFiles(dataState, 'rulings')" :disabled="disabled" />
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';
import { getMagicDataState, type MagicDataState, type MagicDataFile } from '~/composables/useMagicData';

definePageMeta({ layout: 'admin', title: 'Scryfall 导入' });

const form = reactive({ cards: '', rulings: '' });

/** Scryfall bulk files matching the given name prefix. */
function scryfallFiles(dataState: MagicDataState | null, prefix: string) {
  return (dataState?.scryfall ?? [])
    .filter(f => f.name.startsWith(prefix))
    .map(f => ({ label: f.name, value: f.path }));
}

/** Latest discovered file whose name starts with the given bulk prefix. */
function latestFile(files: MagicDataFile[], prefix: string): string {
  const matches = files.filter(f => f.name.startsWith(prefix));
  return matches.length > 0 ? matches[matches.length - 1]!.path : '';
}

/** Defaults each selection to the newest bulk file of the matching kind. */
async function setDefaultFiles() {
  const state = await getMagicDataState();
  form.cards = latestFile(state.scryfall, 'all-cards');
  form.rulings = latestFile(state.scryfall, 'rulings');
}

onMounted(() => {
  void setDefaultFiles();
});

const operation = computed<TaskOperation>(() => ({
  key:      'scryfall',
  label:    '导入 Scryfall',
  icon:     'i-lucide-play',
  disabled: form.cards.trim().length === 0,
  create:   async () => orpc.magic.createTask.scryfallImport({
    cards:   form.cards.trim() || undefined,
    rulings: form.rulings.trim() || undefined,
  }) as Promise<TaskPageSnapshot>,
}));
</script>
