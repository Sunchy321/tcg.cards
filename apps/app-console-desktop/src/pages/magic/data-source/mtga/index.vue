<template>
  <MagicSourceImportPage
    title="MTGA 注音导入"
    icon="i-lucide-languages"
    description="从 MTGA 卡库导入日文卡名的注音（振り仮名），以草稿状态写入待审校。"
    task-title="MTGA 注音导入"
    :operation="operation"
  >
    <template #params="{ dataState }">
      <div class="space-y-4 pt-4">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">MTGA 数据目录</div>
          <div class="mt-1 font-mono text-sm">{{ dataState?.mtga.dir ?? '未发现' }}</div>
        </div>
        <div class="text-xs text-muted">
          {{ dataState?.mtga.cardDatabase ? '已发现 Raw_CardDatabase.mtga，导入结果经审校后生效。' : '目录中缺少 Raw_CardDatabase.mtga（需为解压后的卡库文件）。' }}
        </div>
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';
import { getMagicDataState } from '~/composables/useMagicData';

definePageMeta({ layout: 'admin', title: 'MTGA 注音导入' });

const operation = computed<TaskOperation>(() => ({
  key:      'mtga-ruby',
  label:    '导入 MTGA 注音',
  icon:     'i-lucide-play',
  disabled: false,
  create:   async () => {
    const state = await getMagicDataState();
    const dir = state.mtga.dir ?? '';
    if (!dir) {
      throw new Error('未发现 MTGA 数据目录');
    }
    return orpc.magic.createTask.rubyImport({ dir }) as Promise<TaskPageSnapshot>;
  },
}));
</script>
