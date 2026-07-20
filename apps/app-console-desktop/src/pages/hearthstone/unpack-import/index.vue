<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import type { TaskPageSnapshot } from '@tcg-cards/model/src/task';
import type { TaskOperation } from '~/components/task/TaskController';
import { orpc } from '~/lib/orpc';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';
import { listLocalHsdataSourceVersions } from '~/composables/useHsdataRepo';

definePageMeta({
  layout: 'admin',
  title: '拆包导入',
});

interface UnpackBuild {
  buildNumber: number;
  fileName: string;
  size: number;
}

interface UnpackItem {
  buildNumber: number;
  shortName: string;
  size: number;
  unpackStatus: string | undefined;
}

const toast = useToast();

const loading = ref(false);
const items = ref<UnpackItem[]>([]);
const dryRun = ref(false);

const controller = ref<{ attach(snapshot: TaskPageSnapshot): void; currentTaskRunId: string | null }>();
const taskResult = ref<Record<string, unknown> | null>(null);
const STATE_KEY = 'console-desktop-hearthstone-unpack-import-page';

const selectedKey = ref<number | null>(null);
const hideImported = ref(loadState().hideImported);

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw) as { hideImported: boolean };
  } catch { /* ignore */ }
  return { hideImported: false };
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({ hideImported: hideImported.value }));
}

watch(hideImported, saveState);
const selectedItem = computed(() => items.value.find(i => i.buildNumber === selectedKey.value) ?? null);

const total = computed(() => items.value.length);
const latestBuild = computed(() => items.value[0]?.buildNumber ?? '—');

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed': return { label: '已导入', color: 'success' as const };
    case 'failed':    return { label: '失败', color: 'error' as const };
    default:          return { label: '待导入', color: 'neutral' as const };
  }
}

function statusRowClass(status: string) {
  switch (status) {
    case 'completed': return 'border-success/40 bg-success/5 hover:bg-success/10';
    case 'failed':    return 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10';
    default:          return 'border-default bg-default hover:bg-elevated';
  }
}

async function loadData() {
  loading.value = true;
  try {
    const [b, v, patches] = await Promise.all([
      orpc.hearthstone.unpack.listUnpackBuilds() as Promise<UnpackBuild[]>,
      listLocalHsdataSourceVersions(),
      (orpc.hearthstone.announcement as any).patches() as Promise<Array<{ buildNumber: number; shortName: string }>>,
    ]);
    const versionMap: Record<number, string> = {};
    for (const s of v) versionMap[s.sourceTag] = s.unpackStatus;
    const patchMap: Record<number, string> = {};
    for (const row of patches) patchMap[row.buildNumber] = row.shortName;

    items.value = b.map(build => ({
      buildNumber: build.buildNumber,
      shortName: patchMap[build.buildNumber] ?? '—',
      size: build.size,
      unpackStatus: versionMap[build.buildNumber],
    }));
  } catch (error) {
    toast.add({ title: '加载失败', description: getConsoleErrorMessage(error), color: 'error' });
  } finally {
    loading.value = false;
  }
}

async function handleReset(sourceTags: number[]) {
  const result = await orpc.hearthstone.unpack.resetUnpackStatus({ sourceTags }) as { resetCount: number };
  toast.add({ title: '已重置', description: `${result.resetCount} 个版本`, color: 'success' });
  await loadData();
}

const importOperation = computed<TaskOperation>(() => ({
  key: 'import',
  label: '执行导入',
  icon: 'i-lucide-play',
  disabled: !selectedKey.value,
  create: async () => orpc.hearthstone.createTask.unpackImport({
    zipName: String(selectedKey.value!),
    dryRun: dryRun.value,
  }) as Promise<TaskPageSnapshot>,
}));

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = snap.result ?? null;
  loadData();
}

function onFailed() {}
function onCreateError() {}

onMounted(async () => {
  await loadData();
  const candidates = hideImported.value
    ? items.value.filter(i => !i.unpackStatus || i.unpackStatus !== 'completed')
    : items.value;
  if (candidates.length > 0) selectedKey.value = candidates[0]!.buildNumber;
});
</script>

<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-package-open" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">拆包导入</h1>
          </div>
          <p class="mt-1 text-sm text-muted">从 Unity dbf.unity3d 拆包数据导入卡牌附加信息。</p>
        </div>
        <div class="ml-auto hidden items-center gap-6 sm:flex">
          <div class="text-right">
            <div class="text-xs text-muted">可用版本</div>
            <div class="text-sm font-semibold">{{ total }}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-muted">最新 Build</div>
            <div class="text-sm font-semibold">{{ latestBuild }}</div>
          </div>
        </div>
        <div class="flex gap-2">
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadData" />
        </div>
      </div>
    </div>

    <div class="grid gap-4 xl:grid-cols-3">
      <div class="space-y-4 xl:col-span-2">
        <TaskController
          ref="controller"
          title="拆包导入"
          :operations="[importOperation]"
          @completed="onCompleted"
          @failed="onFailed"
          @create-error="onCreateError"
        >
          <template #params="{ disabled }">
            <div class="space-y-4 pt-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="font-medium">拆包导入</div>
                  <p class="mt-1 text-xs text-muted">选择一个版本后执行导入。</p>
                </div>
                <UBadge
                  :label="dryRun ? 'Dry run' : 'Write mode'"
                  :color="dryRun ? 'neutral' : 'warning'"
                  variant="soft"
                />
              </div>

              <div v-if="selectedItem" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">选中版本</div>
                  <div class="mt-1 font-mono text-sm font-semibold">{{ selectedItem.buildNumber }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">补丁名</div>
                  <div class="mt-1 truncate text-sm">{{ selectedItem.shortName }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">状态</div>
                  <div class="mt-1">
                    <UBadge
                      :label="selectedItem.unpackStatus === 'completed' ? '已导入' : selectedItem.unpackStatus === 'failed' ? '失败' : '待导入'"
                      :color="selectedItem.unpackStatus === 'completed' ? 'success' : selectedItem.unpackStatus === 'failed' ? 'error' : 'neutral'"
                      variant="soft"
                      size="xs"
                    />
                  </div>
                </div>
              </div>

              <UCheckbox v-model="dryRun" label="Dry Run" :disabled="disabled" />
            </div>
          </template>
        </TaskController>

        <UCard v-if="taskResult">
          <template #header>
            <div class="flex items-center gap-2">
              <span class="font-medium">导入报告</span>
              <UBadge label="Success" color="success" variant="soft" />
            </div>
          </template>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">Build Number</div>
              <div class="mt-1 font-mono text-sm">{{ taskResult.buildNumber }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">卡牌数量</div>
              <div class="mt-1 font-mono text-sm">{{ taskResult.cardCount }}</div>
            </div>
          </div>
        </UCard>
      </div>

      <div class="space-y-4">
        <VersionSelectPanel
          :items="items"
          :item-key="(i: UnpackItem) => i.buildNumber"
          :patch-short-name="(i: UnpackItem) => i.shortName"
          :status-value="(i: UnpackItem) => i.unpackStatus"
          :status-badge="statusBadge"
          :status-row-class="statusRowClass"
          :loading="loading"
          search-placeholder="搜索 Build 号"
          hide-completed-label="隐藏已导入"
          :hide-completed="hideImported"
          @update:hide-completed="v => hideImported = v"
          :model-value="selectedKey"
          @update:model-value="k => selectedKey = k"
          @reset="handleReset"
        >
          <template #header-actions>
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" :loading="loading" @click="loadData" />
          </template>
          <template #extra="{ item }">
            <span class="text-xs text-muted">{{ formatSize((item as UnpackItem).size) }}</span>
          </template>
        </VersionSelectPanel>
      </div>
    </div>
  </div>
</template>
