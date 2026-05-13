<template>
  <div class="space-y-6">
    <UCard>
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">hsdata 数据源</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            查看本地 hsdata 数据库状态、仓库路径与可用版本。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="同步远端版本"
            icon="i-lucide-cloud-sync"
            color="primary"
            variant="soft"
            :loading="syncing"
            :disabled="!state?.repoPath || loadingState || loadingFiles || loadingOverview"
            @click="syncRemoteVersions"
          />
          <UButton
            label="打开数据导入"
            icon="i-lucide-download"
            @click="openImport()"
          />
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loadingState || loadingFiles || loadingOverview"
            @click="reloadAll"
          />
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-medium">本地数据库概览</div>
            <p class="mt-1 text-xs text-muted">
              展示当前 desktop 本地数据库中的 hsdata 原始归档状态。
            </p>
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loadingOverview"
            @click="loadOverview"
          />
        </div>
      </template>

      <div v-if="loadingOverview && !overview" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>
      <div v-else class="space-y-4">
        <UAlert
          v-if="overviewError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="overviewError"
        />

        <div v-if="overview" class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <UCard
              v-for="card in overviewSummaryCards"
              :key="card.key"
              class="bg-elevated"
            >
              <div class="text-xs text-muted">{{ card.label }}</div>
              <div class="mt-1 text-lg font-semibold">{{ card.value }}</div>
            </UCard>
          </div>

          <div class="grid gap-4 xl:grid-cols-2">
            <UCard
              v-for="table in overviewTableCards"
              :key="table.key"
            >
              <template #header>
                <div class="flex items-center justify-between gap-2">
                  <span class="font-mono text-sm font-medium">{{ table.name }}</span>
                  <UBadge :label="table.kind" color="neutral" variant="soft" size="xs" />
                </div>
              </template>

              <div class="space-y-2">
                <div
                  v-for="metric in table.metrics"
                  :key="metric.label"
                  class="flex items-start justify-between gap-4 text-sm"
                >
                  <span class="text-muted">{{ metric.label }}</span>
                  <span class="text-right font-mono">{{ metric.value }}</span>
                </div>
              </div>
            </UCard>
          </div>
        </div>
        <div v-else-if="!overviewError" class="py-6 text-center text-sm text-muted">
          暂无本地数据库概览
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <div class="font-medium">仓库配置</div>
          <p class="mt-1 text-xs text-muted">
            查看当前已配置的数据源路径。
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UAlert
          v-if="!state?.repoPath"
          color="warning"
          variant="soft"
          icon="i-lucide-folder-search"
          :ui="{ icon: 'sm:self-center' }"
        >
          <template #description>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>尚未配置 hsdata 数据源路径，请先前往设置页完成设置。</span>
              <div class="sm:ml-auto">
                <UButton
                  label="打开设置"
                  icon="i-lucide-settings"
                  color="warning"
                  variant="soft"
                  @click="openSettings"
                />
              </div>
            </div>
          </template>
        </UAlert>

        <div v-if="state?.repoPath" class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">当前仓库</div>
          <div class="mt-1 break-all font-mono text-sm">{{ state.repoPath }}</div>
        </div>

        <UAlert
          v-if="stateError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="stateError"
        />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-medium">可用来源列表</div>
            <p class="mt-1 text-xs text-muted">
              展示当前可同步并可导入的数据版本。
            </p>
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loadingFiles"
            :disabled="!state?.repoPath"
            @click="loadFiles"
          />
        </div>
      </template>

      <div v-if="loadingFiles && files.length === 0" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>
      <div v-else class="space-y-4">
        <UAlert
          v-if="filesError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="filesError"
        />

        <div v-if="!state?.repoPath && !filesError" class="py-8 text-center text-sm text-muted">
          请先在设置页完成 hsdata 数据源配置
        </div>
        <div v-else-if="files.length === 0 && !filesError" class="py-8 text-center text-sm text-muted">
          暂无可导入来源
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="file in files"
            :key="file.id"
            class="flex flex-col gap-3 rounded-lg border border-default p-3 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-sm">{{ file.name }}</span>
                <UBadge
                  v-if="file.sourceTag != null"
                  :label="String(file.sourceTag)"
                  size="xs"
                  color="primary"
                  variant="soft"
                />
              </div>
              <div class="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                <span>{{ file.shortCommit }}</span>
                <span>{{ formatHsdataBytes(file.size) }}</span>
                <span v-if="file.time">{{ formatHsdataDate(file.time) }}</span>
              </div>
            </div>

            <UButton
              label="前往导入"
              icon="i-lucide-arrow-right"
              color="neutral"
              variant="soft"
              @click="openImport(file.id)"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import {
  getLocalHsdataOverview,
  formatHsdataBytes,
  formatHsdataDate,
  getHsdataErrorMessage,
  getHsdataRepoState,
  listHsdataSources,
  syncHsdataRemoteVersions,
} from '~/composables/useHsdataRepo';
import type {
  HsdataFile,
  HsdataOverview,
  HsdataRepoState,
} from '~/composables/useHsdataRepo';

definePageMeta({
  layout: 'admin',
  title:  '数据源',
});

const router = useRouter();

const state = ref<HsdataRepoState | null>(null);
const files = ref<HsdataFile[]>([]);
const stateError = ref('');
const filesError = ref('');
const loadingState = ref(false);
const loadingFiles = ref(false);
const loadingOverview = ref(false);
const syncing = ref(false);
const overview = ref<HsdataOverview | null>(null);
const overviewError = ref('');
const toast = useToast();

const overviewSummaryCards = computed(() => {
  const summary = overview.value?.summary;

  if (!summary) {
    return [];
  }

  return [
    { key: 'sourceVersionCount', label: '版本记录', value: summary.sourceVersionCount },
    { key: 'completedSourceVersionCount', label: '完成版本', value: summary.completedSourceVersionCount },
    { key: 'failedSourceVersionCount', label: '失败版本', value: summary.failedSourceVersionCount },
    { key: 'snapshotCount', label: '快照总数', value: summary.snapshotCount },
    { key: 'latestSnapshotCount', label: '最新快照行数', value: summary.latestSnapshotCount },
    { key: 'tagRowCount', label: '标签归档行数', value: summary.tagRowCount },
  ];
});

const overviewTableCards = computed(() => {
  const tables = overview.value?.tables;

  if (!tables) {
    return [];
  }

  return [
    {
      key:     'source_versions',
      name:    tables.sourceVersions.name,
      kind:    tables.sourceVersions.kind,
      metrics: [
        { label: '总行数', value: tables.sourceVersions.rows },
        { label: '最后导入时间', value: formatHsdataDate(tables.sourceVersions.latestImportedAt) },
        { label: '最后完成版本', value: tables.sourceVersions.latestCompletedSourceTag ?? '-' },
        { label: 'completed', value: tables.sourceVersions.statusCounts.completed },
        { label: 'failed', value: tables.sourceVersions.statusCounts.failed },
        { label: 'processing', value: tables.sourceVersions.statusCounts.processing },
        { label: 'pending', value: tables.sourceVersions.statusCounts.pending },
      ],
    },
    {
      key:     'raw_entity_snapshots',
      name:    tables.rawEntitySnapshots.name,
      kind:    tables.rawEntitySnapshots.kind,
      metrics: [
        { label: '总行数', value: tables.rawEntitySnapshots.rows },
        { label: '最新快照行数', value: tables.rawEntitySnapshots.latestRows },
        { label: '去重卡牌数', value: tables.rawEntitySnapshots.distinctCardCount },
        { label: '更新时间', value: formatHsdataDate(tables.rawEntitySnapshots.updatedAt) },
      ],
    },
    {
      key:     'raw_entity_snapshot_tags',
      name:    tables.rawEntitySnapshotTags.name,
      kind:    tables.rawEntitySnapshotTags.kind,
      metrics: [
        { label: '总行数', value: tables.rawEntitySnapshotTags.rows },
        { label: '快照数', value: tables.rawEntitySnapshotTags.distinctSnapshotCount },
        { label: '枚举数', value: tables.rawEntitySnapshotTags.distinctEnumCount },
      ],
    },
    {
      key:     'tag_value_view',
      name:    tables.tagValueView.name,
      kind:    tables.tagValueView.kind,
      metrics: [
        { label: '总行数', value: tables.tagValueView.rows },
        { label: '快照数', value: tables.tagValueView.distinctSnapshotCount },
        { label: '枚举数', value: tables.tagValueView.distinctEnumCount },
      ],
    },
  ];
});

function openImport(sourceId?: string) {
  void router.push({
    path:  '/hearthstone/data-import',
    query: sourceId ? { source: sourceId } : undefined,
  });
}

function openSettings() {
  void router.push({
    path: '/settings/games/hearthstone',
  });
}

async function loadState() {
  loadingState.value = true;
  stateError.value = '';

  try {
    state.value = await getHsdataRepoState();
  } catch (error) {
    console.error('Failed to load hsdata repo state:', error);
    stateError.value = getHsdataErrorMessage(error);
    state.value = null;
  } finally {
    loadingState.value = false;
  }
}

async function loadFiles() {
  if (!state.value?.repoPath) {
    files.value = [];
    filesError.value = '';
    return;
  }

  loadingFiles.value = true;
  filesError.value = '';

  try {
    files.value = await listHsdataSources();
  } catch (error) {
    console.error('Failed to list hsdata sources:', error);
    filesError.value = getHsdataErrorMessage(error);
    files.value = [];
  } finally {
    loadingFiles.value = false;
  }
}

async function loadOverview() {
  loadingOverview.value = true;
  overviewError.value = '';

  try {
    overview.value = await getLocalHsdataOverview();
  } catch (error) {
    console.error('Failed to load local hsdata overview:', error);
    overviewError.value = getHsdataErrorMessage(error);
    overview.value = null;
  } finally {
    loadingOverview.value = false;
  }
}

async function reloadAll() {
  await loadState();
  await Promise.all([loadFiles(), loadOverview()]);
}

async function syncRemoteVersions() {
  syncing.value = true;
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  try {
    const result = await syncHsdataRemoteVersions();
    await reloadAll();
    toast.add({
      title:       '已完成远端版本同步',
      description: `${result.remote} -> ${result.repoPath}`,
      color:       'success',
    });
  } catch (error) {
    console.error('Failed to sync hsdata remote versions:', error);
    toast.add({
      title:       '同步远端版本失败',
      description: getHsdataErrorMessage(error),
      color:       'error',
    });
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  void reloadAll();
});
</script>
