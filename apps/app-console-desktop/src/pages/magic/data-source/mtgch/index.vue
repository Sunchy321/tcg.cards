<template>
  <MagicSourceImportPage
    title="MTGCH 导入"
    icon="i-lucide-file-json"
    description="从本地 MTGCH 简中压缩包导入本地化数据。"
    task-title="MTGCH 导入"
    :operation="operation"
    :result-labels="resultLabels"
  >
    <template #params="{ disabled, dataState }">
      <div class="space-y-4 pt-4">
        <FileSelect
          v-model="form.archive"
          label="MTGCH 压缩包"
          :files="archiveFiles(dataState)"
          :disabled="disabled"
          :required="true"
        />
        <div class="text-xs text-muted">
          将从压缩包读取卡牌译文、牌张说明、风味文字、裁定、系列名称与牌张类别。
        </div>
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { startDesktopTask } from '~/lib/orpc';
import { getMagicDataState, type MagicDataState } from '~/composables/useMagicData';

definePageMeta({ layout: 'admin', title: 'MTGCH 导入' });

const form = reactive({ archive: '' });
const resultLabels = { card: '卡牌译文', scryfall: '卡牌关联', oracle: '卡牌说明', flavor: '风味文字', ruling: '裁定译文', set: '系列译名', type: '牌张类别' };

function archiveFiles(dataState: MagicDataState | null) {
  return (dataState?.mtgch.archives ?? []).map(f => ({ label: f.name, value: f.path }));
}

/** Defaults the selection to the latest archive. */
async function setDefaultArchive() {
  const state = await getMagicDataState();
  const archives = state.mtgch.archives;
  if (archives.length > 0) {
    form.archive = archives[archives.length - 1]!.path;
  }
}

const operation = computed<TaskOperation>(() => ({
  key:      'mtgch',
  taskType: 'magic_mtgch_import',
  label:    '导入 MTGCH',
  icon:     'i-lucide-play',
  disabled: form.archive.trim().length === 0,
  create:   async () => startDesktopTask('magic_mtgch_import', {
    archive: form.archive.trim(),
  }),
}));

onMounted(() => {
  void setDefaultArchive();
});
</script>
