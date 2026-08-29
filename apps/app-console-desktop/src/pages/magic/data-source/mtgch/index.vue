<template>
  <MagicSourceImportPage
    title="MTGCH 导入"
    icon="i-lucide-file-json"
    description="从本地 MTGCH 简中导出文件导入本地化数据。"
    task-title="MTGCH 导入"
    :operation="operation"
  >
    <template #params="{ disabled, dataState }">
      <div class="space-y-4 pt-4">
        <div v-if="dataState?.mtgch.dir" class="text-xs text-muted">MTGCH 导出目录：{{ dataState.mtgch.dir }}</div>
        <FileSelect v-model="form.card" label="Card" :files="mtgchFiles(dataState)" :disabled="disabled" />
        <FileSelect v-model="form.oracle" label="Oracle" :files="mtgchFiles(dataState)" :disabled="disabled" />
        <FileSelect v-model="form.flavor" label="Flavor" :files="mtgchFiles(dataState)" :disabled="disabled" />
        <FileSelect v-model="form.ruling" label="Ruling" :files="mtgchFiles(dataState)" :disabled="disabled" />
        <FileSelect v-model="form.set" label="Set" :files="mtgchFiles(dataState)" :disabled="disabled" />
        <FileSelect v-model="form.type" label="Type" :files="mtgchFiles(dataState)" :disabled="disabled" />
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';
import type { MagicDataState } from '~/composables/useMagicData';

definePageMeta({ layout: 'admin', title: 'MTGCH 导入' });

const form = reactive({ card: '', oracle: '', flavor: '', ruling: '', set: '', type: '' });

function mtgchFiles(dataState: MagicDataState | null) {
  return (dataState?.mtgch.files ?? []).map(f => ({ label: f.name, value: f.path }));
}

const operation = computed<TaskOperation>(() => ({
  key:      'mtgch',
  label:    '导入 MTGCH',
  icon:     'i-lucide-play',
  disabled: Object.values(form).every(v => v.trim().length === 0),
  create:   async () => orpc.magic.createTask.mtgchImport({
    card:   form.card.trim() || undefined,
    oracle: form.oracle.trim() || undefined,
    flavor: form.flavor.trim() || undefined,
    ruling: form.ruling.trim() || undefined,
    set:    form.set.trim() || undefined,
    type:   form.type.trim() || undefined,
  }) as Promise<TaskPageSnapshot>,
}));
</script>
