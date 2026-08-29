<template>
  <MagicSourceImportPage
    title="Scryfall 导入"
    icon="i-lucide-download"
    description="从本地 Scryfall bulk 文件导入卡牌 / 系列 / 裁定数据。"
    task-title="Scryfall 导入"
    :operation="operation"
  >
    <template #params="{ disabled, dataState }">
      <div class="space-y-4 pt-4">
        <FileSelect v-model="form.cards" label="Cards 文件" :files="scryfallFiles(dataState)" :disabled="disabled" :required="true" />
        <FileSelect v-model="form.sets" label="Sets 文件" :files="scryfallFiles(dataState)" :disabled="disabled" />
        <FileSelect v-model="form.rulings" label="Rulings 文件" :files="scryfallFiles(dataState)" :disabled="disabled" />
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';
import type { MagicDataState } from '~/composables/useMagicData';

definePageMeta({ layout: 'admin', title: 'Scryfall 导入' });

const form = reactive({ cards: '', sets: '', rulings: '' });

function scryfallFiles(dataState: MagicDataState | null) {
  return (dataState?.scryfall ?? []).map(f => ({ label: f.name, value: f.path }));
}

const operation = computed<TaskOperation>(() => ({
  key:      'scryfall',
  label:    '导入 Scryfall',
  icon:     'i-lucide-play',
  disabled: form.cards.trim().length === 0,
  create:   async () => orpc.magic.createTask.scryfallImport({
    cards:   form.cards.trim() || undefined,
    sets:    form.sets.trim() || undefined,
    rulings: form.rulings.trim() || undefined,
  }) as Promise<TaskPageSnapshot>,
}));
</script>
