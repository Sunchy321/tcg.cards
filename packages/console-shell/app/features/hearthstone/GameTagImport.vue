<template>
  <UButton
    label="读取标签"
    icon="i-lucide-download"
    :loading="reading"
    :disabled="applying"
    @click="readPreview"
  />

  <UModal v-model:open="previewOpen" title="读取游戏标签" class="sm:max-w-2xl">
    <template #body>
      <div class="space-y-4">
        <div v-if="reading" class="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" />
          <span>正在读取游戏标签…</span>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="errorMessage"
        />

        <UAlert
          v-if="resultMessage"
          color="success"
          variant="soft"
          icon="i-lucide-circle-check"
          :description="resultMessage"
        />

        <template v-if="preview && !resultMessage">
          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div v-for="item in statistics" :key="item.label" class="rounded-lg bg-slate-50 p-3">
              <div class="text-xs text-slate-500">{{ item.label }}</div>
              <div class="mt-1 text-lg font-semibold text-slate-800">{{ item.value }}</div>
            </div>
          </div>

          <p class="text-xs text-slate-500">
            当前目录中 {{ preview.retainedDbCount }} 个未出现在本次读取结果中的标签会保留。
          </p>

          <div v-if="preview.nameChanges.length > 0" class="rounded-lg border border-slate-200">
            <details>
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
                查看将更新的名称（{{ preview.nameChanges.length }}）
              </summary>
              <div class="max-h-64 space-y-2 overflow-y-auto border-t border-slate-200 p-3">
                <div v-for="change in preview.nameChanges" :key="change.enumId" class="grid gap-1 text-sm sm:grid-cols-[5rem_1fr]">
                  <span class="font-mono text-xs text-slate-400">#{{ change.enumId }}</span>
                  <span class="break-all">
                    <span class="text-slate-500">{{ change.currentName ?? '（无名称）' }}</span>
                    <UIcon name="i-lucide-arrow-right" class="mx-1 inline size-3 text-slate-400" />
                    <span class="font-medium text-slate-800">{{ change.incomingName }}</span>
                  </span>
                </div>
              </div>
            </details>
          </div>

          <div v-if="preview.aliasUpdates.length > 0" class="rounded-lg border border-slate-200">
            <details>
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
                查看将补充的名称（{{ preview.aliasUpdates.length }}）
              </summary>
              <div class="max-h-64 space-y-2 overflow-y-auto border-t border-slate-200 p-3">
                <div v-for="update in preview.aliasUpdates" :key="update.enumId" class="grid gap-1 text-sm sm:grid-cols-[5rem_1fr]">
                  <span class="font-mono text-xs text-slate-400">#{{ update.enumId }}</span>
                  <span class="break-all text-slate-700">{{ update.names.length > 0 ? update.names.join('、') : '清理重复名称' }}</span>
                </div>
              </div>
            </details>
          </div>

          <div v-if="preview.duplicateGroups.length > 0" class="rounded-lg border border-slate-200">
            <details>
              <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
                查看同一 ID 的多个游戏名称（{{ preview.duplicateGroups.length }}）
              </summary>
              <div class="max-h-64 space-y-2 overflow-y-auto border-t border-slate-200 p-3">
                <div v-for="group in preview.duplicateGroups" :key="group.enumId" class="grid gap-1 text-sm sm:grid-cols-[5rem_1fr]">
                  <span class="font-mono text-xs text-slate-400">#{{ group.enumId }}</span>
                  <span class="break-all text-slate-700">{{ group.names.join(' → ') }}</span>
                </div>
              </div>
            </details>
          </div>

          <p class="border-t border-slate-200 pt-4 text-xs text-slate-500">
            确认后会保留旧名称，目录中已有的其他设置也会保留。
          </p>
        </template>

        <div class="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <UButton label="关闭" color="neutral" variant="ghost" :disabled="applying" @click="previewOpen = false" />
          <UButton
            v-if="preview && !resultMessage"
            label="确认导入"
            icon="i-lucide-check"
            :disabled="!hasChanges || applying || reading"
            :loading="applying"
            @click="applyPreview"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { useConsolePlatform } from '@tcg-cards/console-platform';

/** One name declaration and its source order within the game enum. */
interface GameTagMember {
  enumId:           number;
  rawName:          string;
  declarationIndex: number;
}

/** One existing tag whose primary game name will change. */
interface GameTagNameChange {
  enumId:       number;
  currentName:  string | null;
  incomingName: string;
}

/** Names that the import adds to one existing tag's searchable name list. */
interface GameTagAliasUpdate {
  enumId:       number;
  names:        string[];
  deduplicated: boolean;
}

/** Multiple declarations in the game source that share one ID. */
interface GameTagDuplicateGroup {
  enumId: number;
  names:  string[];
}

/** Read-only comparison between one source snapshot and the local tag directory. */
interface GameTagImportPreview {
  members:             GameTagMember[];
  sourceMemberCount:   number;
  uniqueIdCount:       number;
  addedCount:          number;
  mainNameChangeCount: number;
  aliasUpdateCount:    number;
  unchangedCount:      number;
  retainedDbCount:     number;
  nameChanges:         GameTagNameChange[];
  aliasUpdates:        GameTagAliasUpdate[];
  duplicateGroups:     GameTagDuplicateGroup[];
}

/** Counts returned after the confirmed source snapshot is saved. */
interface GameTagImportResult {
  addedCount:          number;
  updatedCount:        number;
  unchangedCount:      number;
  mainNameChangeCount: number;
  aliasUpdateCount:    number;
}

const emit = defineEmits<{ completed: [] }>();
const platform = useConsolePlatform();
const orpc: any = platform.api.createClient();
const reading = ref(false);
const applying = ref(false);
const previewOpen = ref(false);
const preview = ref<GameTagImportPreview | null>(null);
const resultMessage = ref('');
const errorMessage = ref('');

const statistics = computed(() => {
  if (!preview.value) {
    return [];
  }

  return [
    { label: '游戏名称数', value: preview.value.sourceMemberCount },
    { label: '唯一标签', value: preview.value.uniqueIdCount },
    { label: '新增', value: preview.value.addedCount },
    { label: '名称更新', value: preview.value.mainNameChangeCount },
    { label: '名称补充', value: preview.value.aliasUpdateCount },
    { label: '保持不变', value: preview.value.unchangedCount },
    { label: '多名称标签', value: preview.value.duplicateGroups.length },
  ];
});

const hasChanges = computed(() => {
  return preview.value != null
    && (preview.value.addedCount > 0
      || preview.value.mainNameChangeCount > 0
      || preview.value.aliasUpdateCount > 0);
});

/** Reads the game enum and compares it with the current local tag directory. */
async function readPreview() {
  previewOpen.value = true;
  reading.value = true;
  preview.value = null;
  resultMessage.value = '';
  errorMessage.value = '';
  try {
    preview.value = await orpc.hearthstone.tag.previewGameTagImport() as GameTagImportPreview;
  } catch {
    errorMessage.value = '无法读取游戏标签。请确认本机游戏文件和反编译工具可用后重试；如果仍失败，请查看应用日志。';
  } finally {
    reading.value = false;
  }
}

/** Writes the exact member snapshot displayed in the current preview. */
async function applyPreview() {
  if (!preview.value || !hasChanges.value) {
    return;
  }

  applying.value = true;
  errorMessage.value = '';
  try {
    const result = await orpc.hearthstone.tag.applyGameTagImport({
      members: preview.value.members,
    }) as GameTagImportResult;
    resultMessage.value = `导入完成：新增 ${result.addedCount} 个标签，更新 ${result.updatedCount} 个，未变化 ${result.unchangedCount} 个。`;
    emit('completed');
  } catch {
    errorMessage.value = '导入未完成，标签目录没有部分写入。请重新读取后重试；如果仍失败，请查看应用日志。';
  } finally {
    applying.value = false;
  }
}
</script>
