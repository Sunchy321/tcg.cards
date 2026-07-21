<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-download" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">hsdata 导入</h1>
          </div>
          <p class="mt-1 text-sm text-muted">选择数据版本后执行本地导入，确认结果后再发布到远端。</p>
        </div>
        <div class="ml-auto hidden items-center gap-6 sm:flex">
          <div class="text-right">
            <div class="text-xs text-muted">可用版本</div>
            <div class="text-sm font-semibold">{{ items.length }}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-muted">最新 Build</div>
            <div class="text-sm font-semibold">{{ items[0]?.buildNumber ?? '—' }}</div>
          </div>
        </div>
        <div class="flex gap-2">
          <UButton label="同步远端版本" icon="i-lucide-cloud-sync" color="primary" variant="soft" :loading="syncing" :disabled="!state?.repoPath" @click="syncRemoteVersions" />
          <UButton :label="syncingPatchesLabel" icon="i-lucide-tags" color="neutral" variant="soft" :loading="syncingPatches" @click="syncPatches" />
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="loadData" />
        </div>
      </div>
    </div>

    <UAlert v-if="!state?.repoPath" color="warning" variant="soft" icon="i-lucide-folder-search" :ui="{ icon: 'sm:self-center' }">
      <template #description>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>尚未配置 hsdata 数据源路径，请先在设置页完成设置。</span>
          <div class="sm:ml-auto">
            <UButton label="打开设置" icon="i-lucide-settings" color="warning" variant="soft" to="/settings/games/hearthstone" />
          </div>
        </div>
      </template>
    </UAlert>
    <UAlert v-if="sourceError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="sourceError" />

    <div class="grid gap-4 xl:grid-cols-3">
      <div class="space-y-4 xl:col-span-2">
        <TaskController
          title="hsdata 导入"
          :operations="[importOperation]"
          @completed="onCompleted"
          @failed="onFailed"
          @create-error="onCreateError"
        >
          <template #params="{ disabled }">
            <div class="space-y-4 pt-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="font-medium">数据导入</div>
                  <p class="mt-1 text-xs text-muted">选择一个可用版本后执行导入。</p>
                </div>
                <UBadge :label="importForm.dryRun ? 'Dry run' : 'Write mode'" :color="importForm.dryRun ? 'neutral' : 'warning'" variant="soft" />
              </div>

              <div v-if="selectedItem" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">选中来源</div>
                  <div class="mt-1 truncate text-sm">{{ selectedItem.fileName }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">sourceTag</div>
                  <div class="mt-1 font-mono text-sm font-semibold">{{ selectedItem.buildNumber }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">状态</div>
                  <div class="mt-1">
                    <UBadge :label="statusBadge(selectedItem.importStatus ?? 'pending').label" :color="statusBadge(selectedItem.importStatus ?? 'pending').color" variant="soft" size="xs" />
                  </div>
                </div>
              </div>

              <div v-if="selectedItem" class="flex flex-wrap gap-3 text-xs text-muted">
                <span>{{ selectedItem.shortCommit }}</span>
                <span>{{ formatHsdataBytes(selectedItem.fileSize) }}</span>
                <span v-if="selectedItem.time">{{ formatHsdataDate(selectedItem.time) }}</span>
              </div>

              <div class="flex flex-wrap gap-4">
                <UCheckbox v-model="importForm.dryRun" label="Dry Run" :disabled="disabled" />
                <UCheckbox v-model="importForm.force" label="Force" :disabled="disabled" />
              </div>
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
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">快照总数</div>
              <div class="mt-1 font-mono text-sm">{{ (taskResult as any).reports?.[0]?.snapshotCount ?? '—' }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">Entities</div>
              <div class="mt-1 font-mono text-sm">+{{ (taskResult as any).reports?.[0]?.insertedEntities ?? 0 }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">Localizations</div>
              <div class="mt-1 font-mono text-sm">+{{ (taskResult as any).reports?.[0]?.insertedLocalizations ?? 0 }}</div>
            </div>
          </div>
        </UCard>
      </div>

      <div class="space-y-4">
        <VersionSelectPanel
          :items="items"
          :item-key="(i: ImportItem) => i.buildNumber"
          :patch-short-name="(i: ImportItem) => i.shortName"
          :status-value="(i: ImportItem) => i.importStatus"
          :status-badge="statusBadge"
          :status-row-class="statusRowClass"
          :loading="loading"
          search-placeholder="搜索 Build 号"
          hide-completed-label="隐藏已导入"
          :hide-completed="hideImported"
          :model-value="selectedKey"
          @update:hide-completed="v => hideImported = v"
          @update:model-value="k => selectedKey = k"
          @reset="handleReset"
          @reset-checked="handleReset"
        >
          <template #header-actions>
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" :loading="loading" @click="loadData" />
          </template>
          <template #extra="{ item }">
            <span class="text-xs text-muted">{{ (item as ImportItem).fileName }}</span>
            <span class="text-xs text-muted">{{ formatHsdataBytes((item as ImportItem).fileSize) }}</span>
          </template>
        </VersionSelectPanel>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import type { TaskPageSnapshot } from '@tcg-cards/model/src/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';
import {
  formatHsdataBytes,
  formatHsdataDate,
  getHsdataErrorMessage,
  getHsdataRepoState,
  syncPatches as syncPatchesApi,
  listLocalHsdataSourceVersions,
  listHsdataSources,
  resetHsdataImportStatus,
  syncHsdataRemoteVersions,
} from '~/composables/useHsdataRepo';
import type {
  HsdataSourceVersionStatus,
  HsdataRepoState,
} from '~/composables/useHsdataRepo';

definePageMeta({ layout: 'admin', title: '数据导入' });

interface PatchRow { buildNumber: number, shortName: string }

interface ImportItem {
  buildNumber:  number;
  shortName:    string;
  fileId:       string;
  fileName:     string;
  fileSize:     number;
  shortCommit:  string;
  time:         string | undefined;
  importStatus: string | undefined;
}

const STATE_KEY = 'console-desktop-hearthstone-hsdata-import-page';
const toast = useToast();

// ── Page state ──
const state = ref<HsdataRepoState | null>(null);
const loading = ref(false);
const sourceError = ref('');
const syncing = ref(false);
const syncingPatches = ref(false);
const syncPatchesProgress = ref<{ current: number, total: number } | null>(null);
const syncingPatchesLabel = computed(() => {
  const p = syncPatchesProgress.value;
  return p != null ? `同步 Patches (${p.current}/${p.total})` : '同步 Patches';
});

const items = ref<ImportItem[]>([]);
const selectedKey = ref<number | null>(null);
const selectedItem = computed(() => items.value.find(i => i.buildNumber === selectedKey.value) ?? null);
const hideImported = ref(loadState().hideImported);
const importForm = reactive({ dryRun: true, force: false });

const taskResult = ref<Record<string, unknown> | null>(null);

// ── Persistence ──
function loadState() {
  try {
    const r = localStorage.getItem(STATE_KEY);
    if (r)
      return JSON.parse(r) as { hideImported: boolean };
  } catch { /* */ }

  return { hideImported: false };
}
function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify({ hideImported: hideImported.value }));
}

watch(hideImported, saveState);

// ── Status helpers ──
function statusBadge(s: string) {
  switch (s) {
  case 'completed': return { label: '已导入', color: 'success' as const };
  case 'failed': return { label: '失败', color: 'error' as const };
  case 'processing': return { label: '导入中', color: 'primary' as const };
  default: return { label: '待导入', color: 'neutral' as const };
  }
}
function statusRowClass(s: string) {
  switch (s) {
  case 'completed': return 'border-success/40 bg-success/5 hover:bg-success/10';
  case 'failed': return 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10';
  default: return 'border-default bg-default hover:bg-elevated';
  }
}

// ── Data loading ──
async function loadData() {
  loading.value = true;
  try {
    const [files, versions, patches] = await Promise.all([
      listHsdataSources(),
      listLocalHsdataSourceVersions(),
      (orpc.hearthstone.announcement as any).patches() as Promise<PatchRow[]>,
    ]);
    const vMap: Record<number, HsdataSourceVersionStatus> = {};
    for (const v of versions) vMap[v.sourceTag] = v;
    const pMap: Record<number, string> = {};
    for (const p of patches) pMap[p.buildNumber] = p.shortName;

    items.value = files
      .filter(f => f.sourceTag != null)
      .map(f => ({
        buildNumber:  f.sourceTag!,
        shortName:    pMap[f.sourceTag!] ?? '—',
        fileId:       f.id,
        fileName:     f.name,
        fileSize:     f.size,
        shortCommit:  f.shortCommit,
        time:         f.time,
        importStatus: vMap[f.sourceTag!]?.importStatus,
      }))
      .sort((a, b) => b.buildNumber - a.buildNumber);
  } catch (error) {
    toast.add({ title: '加载失败', description: getHsdataErrorMessage(error), color: 'error' });
  } finally { loading.value = false; }
}

// ── Sync ──
async function syncRemoteVersions() {
  syncing.value = true;
  try {
    const result = await syncHsdataRemoteVersions();
    toast.add({ title: '已完成远端版本同步', description: `${result.remote} -> ${result.repoPath}`, color: 'success' });
    await loadRepoState();
  } catch (error) {
    toast.add({ title: '同步远端版本失败', description: getHsdataErrorMessage(error), color: 'error' });
  } finally {
    syncing.value = false;
  }
}
async function syncPatches() {
  syncingPatches.value = true;
  try {
    const result = await syncPatchesApi();
    syncPatchesProgress.value = { current: result.count, total: result.count };
    toast.add({ title: 'Patches 同步完成', description: `已同步 ${result.count} 个 patch`, color: 'success' });
  } catch (error) {
    toast.add({ title: 'Patches 同步失败', description: getHsdataErrorMessage(error), color: 'error' });
  } finally {
    syncingPatches.value = false;
  }
}
async function loadRepoState() {
  try {
    state.value = await getHsdataRepoState();
    sourceError.value = '';
  } catch (error) {
    sourceError.value = getHsdataErrorMessage(error);
    state.value = null;
  }
}

// ── Reset ──
async function handleReset(sourceTags: number[]) {
  const result = await resetHsdataImportStatus(sourceTags);
  toast.add({ title: '已重置', description: `${result.resetCount} 个版本`, color: 'success' });
  await loadData();
}

// ── Import task ──
const importOperation = computed<TaskOperation>(() => ({
  key:      'import',
  label:    '执行导入',
  icon:     'i-lucide-play',
  disabled: !selectedItem.value || !selectedItem.value.fileId,
  create:   async () => orpc.hearthstone.createTask.hsdataImport({
    sourceIds: [selectedItem.value!.fileId],
    dryRun:    importForm.dryRun,
    force:     importForm.force,
  }) as Promise<TaskPageSnapshot>,
}));

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = snap.result ?? null;
  loadData();
}
function onFailed() {}
function onCreateError() {}

onMounted(async () => {
  await loadRepoState();
  await loadData();
  if (items.value.length > 0) {
    const candidates = hideImported.value
      ? items.value.filter(i => !i.importStatus || i.importStatus !== 'completed')
      : items.value;
    if (candidates.length > 0) selectedKey.value = candidates[0]!.buildNumber;
  }
});
</script>
