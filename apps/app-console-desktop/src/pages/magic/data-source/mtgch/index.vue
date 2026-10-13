<template>
  <MagicSourceImportPage
    title="MTGCH 导入"
    icon="i-lucide-file-json"
    description="从本地 MTGCH 简中压缩包导入本地化数据。"
    task-title="MTGCH 导入"
    :operation="operation"
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
          导入将从压缩包读取 zhs_card / zhs_oracle / zhs_flavor / zhs_ruling / zhs_set / zhs_type 六个文件。
        </div>
      </div>
    </template>
  </MagicSourceImportPage>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';
import { getMagicDataState, type MagicDataState } from '~/composables/useMagicData';

definePageMeta({ layout: 'admin', title: 'MTGCH 导入' });

const form = reactive({ archive: '' });

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
  label:    '导入 MTGCH',
  icon:     'i-lucide-play',
  disabled: form.archive.trim().length === 0,
  create:   async () => orpc.magic.createTask.mtgchImport({
    archive: form.archive.trim(),
  }) as Promise<TaskPageSnapshot>,
}));

onMounted(() => {
  void setDefaultArchive();
});
</script>
