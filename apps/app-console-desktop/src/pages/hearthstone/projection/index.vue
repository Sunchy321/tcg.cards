<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto p-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-box" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">数据投影</h1>
          </div>
          <p class="mt-1 text-sm text-muted">将 hsdata 原始数据投影到实体和本地化表中。</p>
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
          title="数据投影"
          :operations="[projectionOperation]"
          @completed="onCompleted"
          @failed="onFailed"
          @create-error="onCreateError"
        >
          <template #actions-before="{ activeOp }">
            <UButton
              v-if="activeOp?.key === 'project'"
              :label="`批量投影（${batchProjectSourceTags.length}）`"
              icon="i-lucide-list-start"
              color="neutral"
              variant="soft"
              :disabled="batchProjectSourceTags.length === 0"
              @click="startBatchProject"
            />
          </template>
          <template #params="{ disabled }">
            <div class="space-y-4 pt-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="font-medium">领域数据投影</div>
                  <p class="mt-1 text-xs text-muted">针对已完成导入的 sourceTag 手动触发领域投影。</p>
                </div>
              </div>

              <div v-if="selectedItem" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">sourceTag</div>
                  <div class="mt-1 font-mono text-sm font-semibold">{{ selectedItem.buildNumber }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">补丁名</div>
                  <div class="mt-1 truncate text-sm">{{ selectedItem.shortName }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">导入状态</div>
                  <div class="mt-1">
                    <UBadge
                      :label="selectedItem.projectionStatus === 'completed' ? '已投影' : '未投影'"
                      :color="selectedItem.projectionStatus === 'completed' ? 'success' : 'neutral'"
                      variant="soft"
                      size="xs"
                    />
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-4">
                <UCheckbox v-model="dryRun" label="Dry Run" :disabled="disabled" />
                <UCheckbox v-model="force" label="Force" :disabled="disabled" />
                <UCheckbox v-model="skipLatestUpdate" label="Skip Latest Update" :disabled="disabled" />
                <UCheckbox v-model="sampleDiff" label="Sample Diff" :disabled="disabled" />
              </div>

              <div class="border-t border-default pt-4">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="text-sm font-medium">Recompute Latest</div>
                    <p class="text-xs text-muted">重新计算所有实体和本地化的 isLatest 标记。</p>
                  </div>
                  <UButton
                    label="执行"
                    icon="i-lucide-refresh-cw"
                    color="warning"
                    variant="soft"
                    size="sm"
                    :loading="recomputing"
                    :disabled="disabled"
                    @click="submitRecomputeLatest"
                  />
                </div>
                <div v-if="recomputing && recomputeProgress" class="mt-2">
                  <div class="text-xs text-muted">{{ recomputeProgress.message }}</div>
                  <UProgress
                    v-if="recomputeProgress.totalRowCount && recomputeProgress.completedRowCount != null"
                    :value="recomputeProgress.completedRowCount"
                    :max="recomputeProgress.totalRowCount"
                    class="mt-1"
                  />
                </div>
                <div v-if="recomputeResult" class="mt-2 text-xs text-muted">
                  实体 {{ recomputeResult.entityUpdatedCount }}/{{ recomputeResult.entityRowCount }}，
                  本地化 {{ recomputeResult.localizationUpdatedCount }}/{{ recomputeResult.localizationRowCount }}，
                  关系 {{ recomputeResult.relationUpdatedCount }}/{{ recomputeResult.relationRowCount }}
                </div>
              </div>
            </div>
          </template>
        </TaskController>

        <UCard v-if="taskResult">
          <template #header>
            <div class="flex items-center gap-2">
              <span class="font-medium">投影报告</span>
              <UBadge :label="taskResult.dryRun ? 'Dry Run' : 'Success'" :color="taskResult.dryRun ? 'warning' : 'success'" variant="soft" />
            </div>
          </template>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">快照</div>
              <div class="mt-1 font-mono text-sm">{{ taskResult.snapshotCount ?? '—' }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">Entities +/~/=</div>
              <div class="mt-1 text-sm">+{{ taskResult.insertedEntities ?? 0 }} ~{{ taskResult.updatedEntities ?? 0 }} ={{ taskResult.reusedEntities ?? 0 }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">Locals +/~/=</div>
              <div class="mt-1 text-sm">+{{ taskResult.insertedLocalizations ?? 0 }} ~{{ taskResult.updatedLocalizations ?? 0 }} ={{ taskResult.reusedLocalizations ?? 0 }}</div>
            </div>
          </div>
        </UCard>
      </div>

      <div class="space-y-4">
        <VersionSelectPanel
          :items="items"
          :item-key="(i: ProjectionItem) => i.buildNumber"
          :patch-short-name="(i: ProjectionItem) => i.shortName"
          :status-value="(i: ProjectionItem) => i.projectionStatus"
          :status-badge="statusBadge"
          :status-row-class="statusRowClass"
          :loading="loading"
          search-placeholder="搜索 Build 号"
          hide-completed-label="隐藏已投影"
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
import { getConsoleErrorMessage } from '@tcg-cards/console-core';
import { listLocalHsdataSourceVersions, resetHsdataProjectionStatus, recomputeLatestHsdataProjection, listenHsdataRecomputeLatestProgress } from '~/composables/useHsdataRepo';
import type { HsdataRecomputeLatestProgressEvent, HsdataRecomputeLatestReport } from '~/composables/useHsdataRepo';

definePageMeta({
  layout: 'admin',
  title:  '数据投影',
});

interface PatchRow {
  buildNumber: number;
  shortName:   string;
}

interface ProjectionItem {
  buildNumber:      number;
  shortName:        string;
  projectionStatus: string | undefined;
}

const toast = useToast();

const loading = ref(false);
const items = ref<ProjectionItem[]>([]);
const selectedKey = ref<number | null>(null);
const hideImported = ref(false);
const selectedItem = computed(() => items.value.find(i => i.buildNumber === selectedKey.value) ?? null);
const force = ref(false);
const skipLatestUpdate = ref(false);
const dryRun = ref(true);
const sampleDiff = ref(false);

const recomputing = ref(false);
const recomputeProgress = ref<HsdataRecomputeLatestProgressEvent | null>(null);
const recomputeResult = ref<HsdataRecomputeLatestReport | null>(null);

const controller = ref<{ attach(snapshot: TaskPageSnapshot): void, currentTaskRunId: string | null }>();
const taskResult = ref<Record<string, unknown> | null>(null);

const total = computed(() => items.value.length);
const latestBuild = computed(() => items.value[0]?.buildNumber ?? '—');

function statusBadge(status: string) {
  switch (status) {
  case 'completed': return { label: '已投影', color: 'success' as const };
  case 'failed': return { label: '失败', color: 'error' as const };
  case 'processing': return { label: '投影中', color: 'primary' as const };
  case 'not_started': return { label: '未投影', color: 'neutral' as const };
  default: return { label: '未投影', color: 'neutral' as const };
  }
}

function statusRowClass(status: string) {
  switch (status) {
  case 'completed': return 'border-success/40 bg-success/5 hover:bg-success/10';
  case 'failed': return 'border-destructive/40 bg-destructive/5 hover:bg-destructive/10';
  default: return 'border-default bg-default hover:bg-elevated';
  }
}

async function loadData() {
  loading.value = true;
  try {
    const [v, patches] = await Promise.all([
      listLocalHsdataSourceVersions(),
      (orpc.hearthstone.announcement as any).patches() as Promise<PatchRow[]>,
    ]);
    const patchMap: Record<number, string> = {};
    for (const row of patches) patchMap[row.buildNumber] = row.shortName;

    items.value = v.map(s => ({
      buildNumber:      s.sourceTag,
      shortName:        patchMap[s.sourceTag] ?? '—',
      projectionStatus: s.projectionStatus,
    })).sort((a, b) => b.buildNumber - a.buildNumber);
  } catch (error) {
    toast.add({ title: '加载失败', description: getConsoleErrorMessage(error), color: 'error' });
  } finally {
    loading.value = false;
  }
}

async function handleReset(sourceTags: number[]) {
  const result = await resetHsdataProjectionStatus(sourceTags);
  toast.add({ title: '已重置', description: `${result.resetCount} 个版本`, color: 'success' });
  await loadData();
}

const projectionOperation = computed<TaskOperation>(() => ({
  key:      'project',
  label:    '执行投影',
  icon:     'i-lucide-waypoints',
  disabled: !selectedKey.value || !selectedItem.value || selectedItem.value.projectionStatus === 'processing',
  create:   async () => orpc.hearthstone.createTask.hsdataProjection({
    sourceTags:       [selectedKey.value!],
    dryRun:           dryRun.value,
    force:            force.value,
    skipLatestUpdate: skipLatestUpdate.value,
    sampleDiff:       sampleDiff.value,
  }) as Promise<TaskPageSnapshot>,
}));

function onCompleted(snap: TaskPageSnapshot) {
  const result = snap.result as any;
  taskResult.value = result?.reports?.[0] ?? result ?? null;
  loadData();
}

async function submitRecomputeLatest() {
  recomputing.value = true;
  recomputeResult.value = null;
  recomputeProgress.value = null;
  const stop = listenHsdataRecomputeLatestProgress(e => {
    recomputeProgress.value = e;
  });
  try {
    recomputeResult.value = await recomputeLatestHsdataProjection();
    toast.add({ title: 'latest 已更新', color: 'success' });
  } catch (error) {
    toast.add({ title: '失败', description: getConsoleErrorMessage(error), color: 'error' });
  } finally {
    stop();
    recomputing.value = false;
  }
}

function onFailed() {}
function onCreateError() {}

const batchProjectSourceTags = computed(() =>
  items.value
    .filter(i => i.projectionStatus !== 'completed' && i.projectionStatus !== 'processing')
    .map(i => i.buildNumber),
);

async function startBatchProject() {
  const sourceTags = batchProjectSourceTags.value;
  if (sourceTags.length === 0) return;
  const snapshot = await orpc.hearthstone.createTask.hsdataProjection({
    sourceTags,
    dryRun:           dryRun.value,
    force:            force.value,
    skipLatestUpdate: skipLatestUpdate.value,
    sampleDiff:       sampleDiff.value,
  }) as TaskPageSnapshot;
  controller.value?.attach(snapshot);
}

onMounted(async () => {
  await loadData();
  if (items.value.length > 0) selectedKey.value = items.value[0]!.buildNumber;
});
</script>
