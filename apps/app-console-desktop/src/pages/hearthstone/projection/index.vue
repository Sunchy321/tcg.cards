<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-box" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">卡牌数据整理</h1>
          </div>
          <p class="mt-1 text-sm text-muted">把选中版本的数据更新到卡牌资料和多语言内容中。</p>
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
          <template #actions-before>
            <UButton
              :label="`批量整理（${batchProjectSourceTags.length}）`"
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
                  <div class="font-medium">卡牌数据整理</div>
                  <p class="mt-1 text-xs text-muted">对已导入的版本数据进行整理。</p>
                </div>
              </div>

              <div v-if="selectedItem" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">构建号</div>
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
                <UCheckbox v-model="dryRun" label="仅预览，不写入" :disabled="disabled" />
                <UCheckbox v-model="force" label="重新处理已完成数据" :disabled="disabled" />
                <UCheckbox v-model="sampleDiff" label="生成差异示例" :disabled="disabled" />
              </div>

            </div>
          </template>
        </TaskController>

        <TaskController
          ref="cardsController"
          title="卡牌收录范围"
          :operations="[cardsOperation]"
          @completed="onCardsCompleted"
          @failed="onCardsFailed"
          @create-error="onCreateError"
        >
          <template #params>
            <div class="space-y-4 pt-4">
              <div class="font-medium">卡牌收录范围</div>
              <p class="text-xs text-muted">根据已整理的数据计算每张卡的收录范围，可单独重新计算。</p>
            </div>
          </template>
        </TaskController>

        <UCard v-if="cardsResult">
          <template #header>
            <div class="flex items-center gap-2">
              <span class="font-medium">收录范围报告</span>
            </div>
          </template>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">派生卡牌</div>
              <div class="mt-1 font-mono text-sm">{{ cardsResult.cards }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">更新行数</div>
              <div class="mt-1 font-mono text-sm">{{ cardsResult.staleCards }}</div>
            </div>
          </div>
        </UCard>

        <UCard v-if="taskResult">
          <template #header>
            <div class="flex items-center gap-2">
              <span class="font-medium">投影报告</span>
              <UBadge :label="taskResult.dryRun ? '仅预览' : '成功'" :color="taskResult.dryRun ? 'warning' : 'success'" variant="soft" />
            </div>
          </template>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">来源记录数</div>
              <div class="mt-1 font-mono text-sm">{{ taskResult.snapshotCount }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">卡牌数据变化</div>
              <div class="mt-1 text-sm">新增 {{ taskResult.insertedEntities }} · 更新 {{ taskResult.updatedEntities }} · 未变 {{ taskResult.reusedEntities }} · 删除 {{ taskResult.entityPlan.delete }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">多语言内容变化</div>
              <div class="mt-1 text-sm">新增 {{ taskResult.insertedLocalizations }} · 更新 {{ taskResult.updatedLocalizations }} · 未变 {{ taskResult.reusedLocalizations }} · 删除 {{ taskResult.localizationPlan.delete }}</div>
            </div>
            <div class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">卡牌关联变化</div>
              <div class="mt-1 text-sm">新增 {{ taskResult.insertedRelations }} · 更新 {{ taskResult.updatedRelations }} · 未变 {{ taskResult.reusedRelations }} · 删除 {{ taskResult.relationPlan.delete }}</div>
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
          <template #extra="{ item }: { item: ProjectionItem }">
            <div class="flex items-center gap-1">
              <UBadge
                :label="`hsdata ${importLabel(item.importStatus)}`"
                :color="importColor(item.importStatus)"
                variant="soft"
                size="xs"
              />
              <UBadge
                v-if="item.unpackAvailable"
                :label="`拆包 ${unpackLabel(item.unpackStatus)}`"
                :color="unpackColor(item.unpackStatus)"
                variant="soft"
                size="xs"
              />
            </div>
          </template>
        </VersionSelectPanel>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc, startDesktopTask } from '~/lib/orpc';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';
import { listLocalHsdataSourceVersions, resetHsdataProjectionStatus } from '~/composables/useHsdataRepo';

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
  importStatus:     string | undefined;
  projectionStatus: string | undefined;
  unpackStatus:     string | undefined;
  unpackAvailable:  boolean;
}

const toast = useToast();

const loading = ref(false);
const items = ref<ProjectionItem[]>([]);
const selectedKey = ref<number | null>(null);
const hideImported = ref(false);
const selectedItem = computed(() => items.value.find(i => i.buildNumber === selectedKey.value) ?? null);
const force = ref(false);
const dryRun = ref(true);
const sampleDiff = ref(false);

const PROJECTION_PAGE_STATE_KEY = 'console-desktop-hearthstone-projection-page';

function persistProjectionPageState() {
  window.localStorage.setItem(PROJECTION_PAGE_STATE_KEY, JSON.stringify({
    dryRun:       dryRun.value,
    force:        force.value,
    sampleDiff:   sampleDiff.value,
    hideImported: hideImported.value,
  }));
}

function restoreProjectionPageState() {
  try {
    const raw = window.localStorage.getItem(PROJECTION_PAGE_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.dryRun === 'boolean') dryRun.value = parsed.dryRun;
    if (typeof parsed.force === 'boolean') force.value = parsed.force;
    if (typeof parsed.sampleDiff === 'boolean') sampleDiff.value = parsed.sampleDiff;
    if (typeof parsed.hideImported === 'boolean') hideImported.value = parsed.hideImported;
  } catch {
    window.localStorage.removeItem(PROJECTION_PAGE_STATE_KEY);
  }
}

watch([dryRun, force, sampleDiff, hideImported], () => {
  persistProjectionPageState();
});

interface TaskResult {
  dryRun:                boolean;
  snapshotCount:         number;
  insertedEntities:      number;
  reusedEntities:        number;
  updatedEntities:       number;
  insertedLocalizations: number;
  reusedLocalizations:   number;
  updatedLocalizations:  number;
  insertedRelations:     number;
  reusedRelations:       number;
  updatedRelations:      number;
  entityPlan:            { upsert: number, delete: number };
  localizationPlan:      { upsert: number, delete: number };
  relationPlan:          { upsert: number, delete: number };
}
const controller = ref<{ attach(snapshot: TaskPageSnapshot): void, currentTaskRunId: string | null }>();
const taskResult = ref<TaskResult | null>(null);

const total = computed(() => items.value.length);
const latestBuild = computed(() => items.value[0]?.buildNumber ?? '—');

function importLabel(status: string | undefined) {
  switch (status) {
  case 'completed': return '已导入';
  case 'failed': return '失败';
  case 'processing': return '导入中';
  default: return '待导入';
  }
}

function importColor(status: string | undefined) {
  switch (status) {
  case 'completed': return 'success' as const;
  case 'failed': return 'error' as const;
  case 'processing': return 'info' as const;
  default: return 'neutral' as const;
  }
}

function unpackLabel(status: string | undefined) {
  switch (status) {
  case 'completed': return '已导入';
  case 'failed': return '失败';
  case 'processing': return '导入中';
  default: return '待导入';
  }
}

function unpackColor(status: string | undefined) {
  switch (status) {
  case 'completed': return 'success' as const;
  case 'failed': return 'error' as const;
  case 'processing': return 'info' as const;
  default: return 'warning' as const;
  }
}

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
      importStatus:     s.importStatus,
      projectionStatus: s.projectionStatus,
      unpackStatus:     s.unpackStatus,
      unpackAvailable:  s.unpackAvailable,
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
  create:   async () => startDesktopTask('hearthstone_project', {
    sourceTags: [selectedKey.value!],
    dryRun:     dryRun.value,
    force:      force.value,
    sampleDiff: sampleDiff.value,
  }),
}));

const cardsController = ref<{ attach(snapshot: TaskPageSnapshot): void, currentTaskRunId: string | null }>();
const cardsResult = ref<{ cards: number, staleCards: number } | null>(null);

const cardsOperation = computed<TaskOperation>(() => ({
  key:    'derive',
  label:  '执行派生',
  icon:   'i-lucide-layers',
  create: async () => startDesktopTask('hearthstone_cards_project', {}),
}));

function onCardsCompleted(snap: TaskPageSnapshot) {
  cardsResult.value = (snap.result as any) ?? null;
}

function onCardsFailed() {}

function onCompleted(snap: TaskPageSnapshot) {
  const result = snap.result as any;
  taskResult.value = result?.reports?.[0] ?? result ?? null;
  loadData();
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
  const snapshot = await startDesktopTask('hearthstone_project', {
    sourceTags,
    dryRun:     dryRun.value,
    force:      force.value,
    sampleDiff: sampleDiff.value,
  });
  if (snapshot) controller.value?.attach(snapshot);
}

onMounted(async () => {
  restoreProjectionPageState();
  await loadData();
  if (items.value.length > 0) selectedKey.value = items.value[0]!.buildNumber;
});
</script>
