<template>
  <MagicSourceImportPage
    title="MTGJSON 导入"
    icon="i-lucide-folder"
    description="从本地 MTGJSON set 目录导入系列数据。"
    task-title="MTGJSON 导入"
    :operation="operation"
    :result-labels="resultLabels"
  >
    <template #params="{ dataState }">
      <div class="space-y-4 pt-4">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">MTGJSON 系列文件夹</div>
          <div class="mt-1 font-mono text-sm">{{ dataState?.mtgjson.dir ?? '未发现' }}</div>
        </div>
        <div class="text-xs text-muted">
          {{ dataState && dataState.mtgjson.fileCount > 0 ? `发现 ${dataState.mtgjson.fileCount} 个系列文件` : '目录中没有系列文件' }}
        </div>
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { startDesktopTask } from '~/lib/orpc';
import { getMagicDataState } from '~/composables/useMagicData';

definePageMeta({ layout: 'admin', title: 'MTGJSON 导入' });
const resultLabels = { sets: '系列资料' };

const operation = computed<TaskOperation>(() => ({
  key:      'mtgjson',
  taskType: 'magic_mtgjson_import',
  label:    '导入 MTGJSON',
  icon:     'i-lucide-play',
  disabled: false,
  create:   async () => {
    const state = await getMagicDataState();
    const dir = state.mtgjson.dir ?? '';
    if (!dir) {
      throw new Error('未发现 MTGJSON set 目录');
    }
    return startDesktopTask('magic_mtgjson_import', { dir });
  },
}));
</script>
