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
            这里仅展示来源、同步状态和归档文件。执行导入、dry run 和写库测试已迁移到独立的数据导入页面。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="打开数据导入"
            icon="i-lucide-download"
            @click="openDataImport"
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

    <UCard
      v-for="source in hsdataSources"
      :key="source.id"
      :class="source.official ? 'ring-2 ring-primary/30' : ''"
    >
      <div class="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div
          class="flex size-10 shrink-0 items-center justify-center rounded-lg"
          :class="source.official ? 'bg-primary/10 text-primary' : 'bg-elevated text-muted'"
        >
          <UIcon :name="source.icon" class="size-5" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold">{{ source.name }}</span>
            <UBadge
              v-if="source.official"
              label="官方"
              color="primary"
              variant="soft"
              size="xs"
            />
          </div>
          <p class="mt-1 text-xs text-muted">{{ source.description }}</p>
          <a
            :href="source.url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-2 inline-flex items-center gap-1 text-xs text-muted transition hover:text-primary"
          >
            {{ source.url }}
            <UIcon name="i-lucide-external-link" class="size-3" />
          </a>
        </div>

        <UButton
          label="前往导入"
          icon="i-lucide-arrow-right"
          color="neutral"
          variant="soft"
          @click="openDataImport"
        />
      </div>

      <div class="mt-4 grid gap-4 xl:grid-cols-3">
        <div class="space-y-4 xl:col-span-2">
          <div v-if="loadingState" class="rounded-lg border border-default py-8 text-center">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
          </div>

          <div v-else-if="!state" class="rounded-lg border border-default py-6 text-center text-sm text-muted">
            暂无同步状态数据
          </div>

          <template v-else>
            <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
              <UCard class="bg-elevated">
                <div class="text-xs text-muted">当前版本</div>
                <div class="text-lg font-semibold">{{ state.tag ?? '-' }}</div>
              </UCard>
              <UCard class="bg-elevated">
                <div class="text-xs text-muted">Commit</div>
                <div class="text-lg font-mono">{{ state.short ?? '-' }}</div>
              </UCard>
              <UCard class="bg-elevated">
                <div class="text-xs text-muted">同步时间</div>
                <div class="text-sm">{{ formatHsdataDate(state.synced_at) }}</div>
              </UCard>
              <UCard class="bg-elevated">
                <div class="text-xs text-muted">归档数量</div>
                <div class="text-lg font-semibold">{{ state.file_count ?? (files.length > 0 ? files.length : '-') }}</div>
              </UCard>
            </div>

            <UCard v-if="history.length > 0">
              <template #header>
                <div class="flex items-center justify-between">
                  <span class="font-medium">同步历史</span>
                  <UBadge :label="`${history.length} 条记录`" size="xs" variant="soft" />
                </div>
              </template>

              <UTable
                :columns="historyColumns"
                :data="history"
                class="w-full"
              />
            </UCard>
          </template>

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

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">R2 归档文件</div>
                <p class="mt-1 text-xs text-muted">
                  仅读展示 `R2_DATA/hearthstone/hsdata/data/` 中的归档 XML。
                </p>
              </div>
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                :loading="loadingFiles"
                @click="loadFiles"
              />
            </div>
          </template>

          <div v-if="loadingFiles && files.length === 0" class="flex justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
          </div>
          <div v-else-if="files.length === 0" class="py-8 text-center text-sm text-muted">
            暂无 R2 文件
          </div>
          <div v-else class="max-h-136 space-y-2 overflow-y-auto pr-1">
            <div
              v-for="file in files"
              :key="file.name"
              class="rounded-lg border border-default p-3"
            >
              <div class="truncate font-mono text-xs">{{ file.name }}</div>
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                <span>{{ formatHsdataBytes(file.size) }}</span>
                <span v-if="file.time">{{ formatHsdataDate(file.time) }}</span>
              </div>
            </div>
          </div>

          <div class="mt-4 rounded-lg border border-dashed border-default p-3 text-xs text-muted">
            如果需要从 R2 归档执行 `importArchive`，请前往数据导入页面。
          </div>
        </UCard>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">

definePageMeta({
  layout: 'admin',
  title:  '数据源',
});
import { useConsolePlatform } from '@tcg-cards/console-platform';
import { computed, onMounted, ref } from 'vue';

const platform = useConsolePlatform();
const orpc: any = platform.api.createClient();

interface HsdataSourceHistory {
  tag: string;
  commit: string;
  type: string;
  date: string;
  count?: number;
  size?: number;
}

interface HsdataSourceState {
  tag?: string;
  commit?: string;
  short?: string;
  synced_at?: string;
  type?: string;
  file_count?: number;
  history?: HsdataSourceHistory[];
}

interface HsdataFile {
  name: string;
  size: number;
  time?: string;
}

interface HsdataOverviewSummary {
  sourceVersionCount: number;
  completedSourceVersionCount: number;
  failedSourceVersionCount: number;
  snapshotCount: number;
  latestSnapshotCount: number;
  tagRowCount: number;
}

interface HsdataStatusCounts {
  completed: number;
  failed: number;
  processing: number;
  pending: number;
}

interface HsdataSourceVersionOverview {
  name: 'source_versions';
  kind: 'table';
  rows: number;
  latestImportedAt?: string;
  latestCompletedSourceTag?: number;
  statusCounts: HsdataStatusCounts;
}

interface HsdataRawEntitySnapshotOverview {
  name: 'raw_entity_snapshots';
  kind: 'table';
  rows: number;
  latestRows: number;
  distinctCardCount: number;
  updatedAt?: string;
}

interface HsdataRawEntitySnapshotTagOverview {
  name: 'raw_entity_snapshot_tags';
  kind: 'table';
  rows: number;
  distinctSnapshotCount: number;
  distinctEnumCount: number;
}

interface HsdataTagValueViewOverview {
  name: 'tag_value_view';
  kind: 'view';
  rows: number;
  distinctSnapshotCount: number;
  distinctEnumCount: number;
}

interface HsdataOverview {
  summary: HsdataOverviewSummary;
  tables: {
    sourceVersions: HsdataSourceVersionOverview;
    rawEntitySnapshots: HsdataRawEntitySnapshotOverview;
    rawEntitySnapshotTags: HsdataRawEntitySnapshotTagOverview;
    tagValueView: HsdataTagValueViewOverview;
  };
}

const hsdataSources = [
  {
    id: 'main',
    name: 'Hearthstone JSON / XML',
    icon: 'i-lucide-database',
    url: 'https://api.hearthstonejson.com/v1/latest/all/enUS/cards.collectible.json',
    description: '当前管理站点使用的 HSData / XML 来源状态。',
    official: true,
  },
];

const state = ref<HsdataSourceState | null>(null);
const files = ref<HsdataFile[]>([]);
const loadingState = ref(false);
const loadingFiles = ref(false);
const loadingOverview = ref(false);
const overview = ref<HsdataOverview | null>(null);
const overviewError = ref('');

const history = computed(() => state.value?.history ?? []);

const historyColumns = [
  { accessorKey: 'tag', header: 'Tag' },
  { accessorKey: 'commit', header: 'Commit' },
  { accessorKey: 'type', header: '类型' },
  { accessorKey: 'date', header: '时间' },
  { accessorKey: 'count', header: '文件数' },
  { accessorKey: 'size', header: '大小' },
];

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
      key: 'source_versions',
      name: tables.sourceVersions.name,
      kind: tables.sourceVersions.kind,
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
      key: 'raw_entity_snapshots',
      name: tables.rawEntitySnapshots.name,
      kind: tables.rawEntitySnapshots.kind,
      metrics: [
        { label: '总行数', value: tables.rawEntitySnapshots.rows },
        { label: '最新快照行数', value: tables.rawEntitySnapshots.latestRows },
        { label: '去重卡牌数', value: tables.rawEntitySnapshots.distinctCardCount },
        { label: '更新时间', value: tables.rawEntitySnapshots.updatedAt ?? '-' },
      ],
    },
    {
      key: 'raw_entity_snapshot_tags',
      name: tables.rawEntitySnapshotTags.name,
      kind: tables.rawEntitySnapshotTags.kind,
      metrics: [
        { label: '总行数', value: tables.rawEntitySnapshotTags.rows },
        { label: '快照数', value: tables.rawEntitySnapshotTags.distinctSnapshotCount },
        { label: '枚举数', value: tables.rawEntitySnapshotTags.distinctEnumCount },
      ],
    },
    {
      key: 'tag_value_view',
      name: tables.tagValueView.name,
      kind: tables.tagValueView.kind,
      metrics: [
        { label: '总行数', value: tables.tagValueView.rows },
        { label: '快照数', value: tables.tagValueView.distinctSnapshotCount },
        { label: '枚举数', value: tables.tagValueView.distinctEnumCount },
      ],
    },
  ];
});

function formatHsdataDate(value?: string) {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatHsdataBytes(size?: number) {
  if (size == null || Number.isNaN(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / (1024 ** 2)).toFixed(1)} MB`;
  return `${(size / (1024 ** 3)).toFixed(1)} GB`;
}

async function loadState() {
  loadingState.value = true;
  try {
    state.value = await orpc.hearthstone.dataSource.hsdata.getState();
  } catch (error) {
    console.error('Failed to load hsdata state:', error);
  } finally {
    loadingState.value = false;
  }
}

async function loadFiles() {
  loadingFiles.value = true;
  try {
    const result = await orpc.hearthstone.dataSource.hsdata.listFiles();
    files.value = [...result].sort((first, second) => {
      const firstTime = first.time ?? '';
      const secondTime = second.time ?? '';
      return secondTime.localeCompare(firstTime);
    });
  } catch (error) {
    console.error('Failed to load hsdata files:', error);
  } finally {
    loadingFiles.value = false;
  }
}

async function loadOverview() {
  loadingOverview.value = true;
  overviewError.value = '';
  try {
    overview.value = await orpc.hearthstone.dataSource.hsdata.getOverview();
  } catch (error) {
    console.error('Failed to load hsdata overview:', error);
    overviewError.value = '数据表概览加载失败';
  } finally {
    loadingOverview.value = false;
  }
}

async function reloadAll() {
  await Promise.all([loadState(), loadFiles(), loadOverview()]);
}

async function openDataImport() {
  await platform.router.push('/hearthstone/data-import');
}

onMounted(() => {
  void reloadAll();
});
</script>
