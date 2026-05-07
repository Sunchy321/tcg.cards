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
            查看 hsdata 数据表概览与状态信息。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loadingOverview"
            @click="loadOverview"
          />
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-medium">数据表概览</div>
            <p class="mt-1 text-xs text-muted">
              展示 `hearthstone_data` 中 hsdata 原始归档相关表和视图的当前统计。
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
          暂无数据表概览
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
interface HsdataOverviewSummary {
  sourceVersionCount:          number;
  completedSourceVersionCount: number;
  failedSourceVersionCount:    number;
  snapshotCount:               number;
  latestSnapshotCount:         number;
  tagRowCount:                 number;
}

interface HsdataStatusCounts {
  completed:  number;
  failed:     number;
  processing: number;
  pending:    number;
}

interface HsdataSourceVersionOverview {
  name:                      'source_versions';
  kind:                      'table';
  rows:                      number;
  latestImportedAt?:         string;
  latestCompletedSourceTag?: number;
  statusCounts:              HsdataStatusCounts;
}

interface HsdataRawEntitySnapshotOverview {
  name:              'raw_entity_snapshots';
  kind:              'table';
  rows:              number;
  latestRows:        number;
  distinctCardCount: number;
  updatedAt?:        string;
}

interface HsdataRawEntitySnapshotTagOverview {
  name:                  'raw_entity_snapshot_tags';
  kind:                  'table';
  rows:                  number;
  distinctSnapshotCount: number;
  distinctEnumCount:     number;
}

interface HsdataTagValueViewOverview {
  name:                  'tag_value_view';
  kind:                  'view';
  rows:                  number;
  distinctSnapshotCount: number;
  distinctEnumCount:     number;
}

interface HsdataOverview {
  summary: HsdataOverviewSummary;
  tables: {
    sourceVersions:        HsdataSourceVersionOverview;
    rawEntitySnapshots:    HsdataRawEntitySnapshotOverview;
    rawEntitySnapshotTags: HsdataRawEntitySnapshotTagOverview;
    tagValueView:          HsdataTagValueViewOverview;
  };
}

const { $orpc: orpc } = useNuxtApp();

const loadingOverview = ref(false);
const overview = ref<HsdataOverview | null>(null);
const overviewError = ref('');

const overviewSummaryCards = computed(() => {
  const summary = overview.value?.summary;

  if (!summary) return [];

  return [
    { key: 'sourceVersionCount', label: '版本记录', value: summary.sourceVersionCount },
    { key: 'completedSourceVersionCount', label: '完成版本', value: summary.completedSourceVersionCount },
    { key: 'failedSourceVersionCount', label: '失败版本', value: summary.failedSourceVersionCount },
    { key: 'snapshotCount', label: '快照总数', value: summary.snapshotCount },
    { key: 'latestSnapshotCount', label: '最新快照行数', value: summary.latestSnapshotCount },
    { key: 'tagRowCount', label: '标签投影行数', value: summary.tagRowCount },
  ];
});

const overviewTableCards = computed(() => {
  const tables = overview.value?.tables;

  if (!tables) return [];

  return [
    {
      key:     'source_versions',
      name:    tables.sourceVersions.name,
      kind:    tables.sourceVersions.kind,
      metrics: [
        { label: '总行数', value: tables.sourceVersions.rows },
        { label: '最后导入时间', value: tables.sourceVersions.latestImportedAt ?? '-' },
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
        { label: '更新时间', value: tables.rawEntitySnapshots.updatedAt ?? '-' },
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

async function loadOverview() {
  loadingOverview.value = true;
  overviewError.value = '';

  try {
    overview.value = await orpc.hearthstone.dataSource.hsdata.getOverview();
  } catch (error) {
    console.error('Failed to load hsdata overview:', error);
    overviewError.value = error instanceof Error ? error.message : '数据表概览加载失败';
  } finally {
    loadingOverview.value = false;
  }
}

onMounted(() => {
  void loadOverview();
});
</script>
