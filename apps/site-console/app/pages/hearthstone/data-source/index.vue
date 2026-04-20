<template>
  <div class="space-y-4">
    <UCard
      v-for="source in sources"
      :key="source.id"
      :class="source.official ? 'ring-2 ring-primary' : ''"
    >
      <!-- Source header -->
      <div class="flex items-center gap-3">
        <div
          class="flex size-9 shrink-0 items-center justify-center rounded-lg"
          :class="source.official ? 'bg-primary/10' : 'bg-gray-100 dark:bg-gray-800'"
        >
          <UIcon
            :name="source.icon"
            class="size-5"
            :class="source.official ? 'text-primary' : 'text-gray-500 dark:text-gray-400'"
          />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ source.name }}</span>
            <UBadge
              v-if="source.official"
              label="官方"
              color="primary"
              variant="soft"
              size="xs"
            />
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ source.description }}</p>
        </div>

        <a
          :href="source.url"
          target="_blank"
          rel="noopener noreferrer"
          class="shrink-0 text-xs text-gray-400 hover:text-primary flex items-center gap-1"
        >
          {{ source.url }}
          <UIcon name="i-lucide-external-link" class="size-3" />
        </a>
      </div>

      <!-- Action tabs -->
      <UTabs
        :items="tabs"
        class="mt-4"
        variant="link"
      >
        <template #overview>
          <div v-if="loadingState" class="py-8 text-center">
            <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-gray-400" />
          </div>
          <div v-else-if="!state" class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无同步状态数据
          </div>
          <div v-else class="space-y-4 py-4">
            <!-- Current status -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <UCard class="bg-gray-50 dark:bg-gray-800/50">
                <div class="text-xs text-gray-500 dark:text-gray-400">当前版本</div>
                <div class="text-lg font-semibold">{{ state.tag ?? '-' }}</div>
              </UCard>
              <UCard class="bg-gray-50 dark:bg-gray-800/50">
                <div class="text-xs text-gray-500 dark:text-gray-400">Commit</div>
                <div class="text-lg font-mono">{{ state.short ?? '-' }}</div>
              </UCard>
              <UCard class="bg-gray-50 dark:bg-gray-800/50">
                <div class="text-xs text-gray-500 dark:text-gray-400">同步时间</div>
                <div class="text-sm">{{ formatDate(state.synced_at) }}</div>
              </UCard>
              <UCard class="bg-gray-50 dark:bg-gray-800/50">
                <div class="text-xs text-gray-500 dark:text-gray-400">文件数量</div>
                <div class="text-lg font-semibold">{{ state.file_count ?? (history.length > 0 ? history.length : '-') }}</div>
              </UCard>
            </div>

            <!-- History table -->
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
          </div>
        </template>

        <template #import>
          <div class="space-y-4 py-4">
            <div class="grid gap-4 xl:grid-cols-3">
              <UCard class="xl:col-span-2">
                <template #header>
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div class="font-medium">P2 原始归档测试</div>
                      <p class="mt-1 text-xs text-muted">
                        选择 R2 中的 CardDefs.xml，或上传本地 XML 后调用 importArchive。
                      </p>
                    </div>
                    <UBadge
                      :label="importForm.dryRun ? 'Dry run' : 'Write mode'"
                      :color="importForm.dryRun ? 'neutral' : 'warning'"
                      variant="soft"
                    />
                  </div>
                </template>

                <div class="space-y-4">
                  <div class="grid gap-3 md:grid-cols-3">
                    <UFormField label="sourceTag">
                      <UInputNumber
                        v-model="importForm.sourceTag"
                        :min="0"
                        class="w-full"
                      />
                    </UFormField>

                    <UFormField label="sourceCommit">
                      <UInput
                        v-model="importForm.sourceCommit"
                        placeholder="可选"
                      />
                    </UFormField>

                    <UFormField label="sourceUri">
                      <UInput
                        v-model="importForm.sourceUri"
                        placeholder="可选，加载 R2 文件后自动填充"
                      />
                    </UFormField>
                  </div>

                  <UFormField label="XML 文件">
                    <UInput
                      type="file"
                      accept=".xml,text/xml,application/xml"
                      @change="handleXmlFileSelect"
                    />
                    <p v-if="importFileName" class="mt-1 text-xs text-muted">
                      当前文件：{{ importFileName }}
                    </p>
                  </UFormField>

                  <UFormField label="CardDefs.xml 内容">
                    <UTextarea
                      v-model="importXml"
                      :rows="14"
                      placeholder="可以直接粘贴 XML，或从右侧 R2 文件列表加载。"
                      class="font-mono text-xs"
                    />
                  </UFormField>

                  <div class="grid gap-3 md:grid-cols-2">
                    <label class="flex items-start gap-3 rounded-lg border border-default p-3">
                      <input
                        v-model="importForm.dryRun"
                        type="checkbox"
                        class="mt-0.5 size-4 rounded border-default"
                      >
                      <span>
                        <span class="block text-sm font-medium">Dry run</span>
                        <span class="text-xs text-muted">默认开启，只解析和统计，不写库。</span>
                      </span>
                    </label>

                    <label class="flex items-start gap-3 rounded-lg border border-default p-3">
                      <input
                        v-model="importForm.force"
                        type="checkbox"
                        class="mt-0.5 size-4 rounded border-default"
                      >
                      <span>
                        <span class="block text-sm font-medium">Force</span>
                        <span class="text-xs text-muted">允许覆盖同 sourceTag 的不同 sourceHash。</span>
                      </span>
                    </label>
                  </div>

                  <UAlert
                    v-if="importError"
                    color="error"
                    variant="soft"
                    icon="i-lucide-circle-alert"
                    :description="importError"
                  />

                  <div class="flex flex-wrap justify-end gap-2">
                    <UButton
                      label="清空输入"
                      icon="i-lucide-rotate-ccw"
                      color="neutral"
                      variant="ghost"
                      @click="resetImportForm"
                    />
                    <UButton
                      label="执行 P2 导入"
                      icon="i-lucide-play"
                      :loading="importing"
                      :disabled="!canImport"
                      @click="submitImport"
                    />
                  </div>
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div class="font-medium">R2 文件</div>
                      <p class="mt-1 text-xs text-muted">
                        从 R2_DATA 的 hearthstone/hsdata/data/ 读取。
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
                    class="flex items-center gap-2 rounded-lg border border-default p-3"
                  >
                    <button
                      type="button"
                      class="min-w-0 flex-1 text-left"
                      @click="loadR2File(file)"
                    >
                      <div class="truncate font-mono text-xs">{{ file.name }}</div>
                      <div class="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                        <span>{{ formatBytes(file.size) }}</span>
                        <span v-if="file.time">{{ formatDate(file.time) }}</span>
                      </div>
                    </button>
                    <UButton
                      label="加载"
                      size="xs"
                      color="neutral"
                      variant="soft"
                      :loading="loadingR2FileName === file.name"
                      @click="loadR2File(file)"
                    />
                  </div>
                </div>
              </UCard>
            </div>

            <UCard v-if="importResult">
              <template #header>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="font-medium">导入报告</span>
                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      :label="importResult.dryRun ? 'Dry run' : 'Written'"
                      :color="importResult.dryRun ? 'neutral' : 'success'"
                      variant="soft"
                    />
                    <UBadge
                      v-if="importResult.skipped"
                      label="Skipped"
                      color="warning"
                      variant="soft"
                    />
                  </div>
                </div>
              </template>

              <div class="space-y-4">
                <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <div
                    v-for="metric in reportMetrics"
                    :key="metric.key"
                    class="rounded-lg border border-default p-3"
                  >
                    <div class="text-xs text-muted">{{ metric.label }}</div>
                    <div class="mt-1 break-all font-mono text-sm">{{ metric.value }}</div>
                  </div>
                </div>

                <div v-if="importResult.discoveredTags.length > 0" class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">本次自动登记 Tag</div>
                  <div class="mt-2 flex flex-wrap gap-1">
                    <UBadge
                      v-for="tag in importResult.discoveredTags"
                      :key="tag"
                      :label="String(tag)"
                      color="neutral"
                      variant="outline"
                      size="xs"
                    />
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </template>

        <template #merge>
          <div class="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无数据
          </div>
        </template>
      </UTabs>
    </UCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title:  '数据源',
});

const { $orpc } = useNuxtApp();

const tabs = [
  { label: '数据概览', slot: 'overview' as const, icon: 'i-lucide-bar-chart-2' },
  { label: '数据导入', slot: 'import' as const, icon: 'i-lucide-download' },
  { label: '数据合并', slot: 'merge' as const, icon: 'i-lucide-git-merge' },
];

const sources = [
  {
    id:          'hsdata',
    name:        'Hearthstone Data (hsdata)',
    icon:        'i-lucide-database',
    official:    false,
    description: 'HearthSim 社区维护的炉石传说卡牌数据库，从游戏客户端提取的原始卡牌数据。',
    url:         'https://github.com/HearthSim/hsdata',
  },
];

interface DataSourceHistory {
  tag:    string;
  commit: string;
  type:   string;
  date:   string;
  count?: number;
  size?:  number;
}

interface DataSourceState {
  tag?:        string;
  commit?:     string;
  short?:      string;
  synced_at?:  string;
  type?:       string;
  file_count?: number;
  history?:    DataSourceHistory[];
}

interface HsdataFile {
  name:  string;
  size:  number;
  time?: string;
}

interface HsdataImportReport {
  dryRun:                boolean;
  skipped:               boolean;
  sourceTag:             number;
  build:                 number;
  sourceHash:            string;
  entityCount:           number;
  insertedSnapshots:     number;
  reusedSnapshots:       number;
  insertedTagRows:       number;
  discoveredTagCount:    number;
  updatedDiscoveredTags: number;
  fallbackTagRowCount:   number;
  latestSnapshotCount:   number;
  discoveredTags:        number[];
}

interface ReportMetric {
  key:   string;
  label: string;
  value: string | number | boolean;
}

const state = ref<DataSourceState | null>(null);
const loadingState = ref(false);

const files = ref<HsdataFile[]>([]);
const loadingFiles = ref(false);
const loadingR2FileName = ref<string | null>(null);

const importXml = ref('');
const importFileName = ref('');
const importError = ref('');
const importing = ref(false);
const importResult = ref<HsdataImportReport | null>(null);

const importForm = reactive({
  sourceTag:    0 as number | null,
  sourceCommit: '',
  sourceUri:    '',
  dryRun:       true,
  force:        false,
});

const history = computed(() => state.value?.history ?? []);
const canImport = computed(() =>
  importXml.value.trim().length > 0
  && typeof importForm.sourceTag === 'number'
  && Number.isInteger(importForm.sourceTag)
  && importForm.sourceTag >= 0
  && !importing.value,
);

const reportMetrics = computed<ReportMetric[]>(() => {
  const report = importResult.value;

  if (!report) {
    return [];
  }

  return [
    { key: 'sourceTag', label: 'sourceTag', value: report.sourceTag },
    { key: 'build', label: 'build', value: report.build },
    { key: 'entityCount', label: 'entities', value: report.entityCount },
    { key: 'insertedSnapshots', label: 'inserted snapshots', value: report.insertedSnapshots },
    { key: 'reusedSnapshots', label: 'reused snapshots', value: report.reusedSnapshots },
    { key: 'insertedTagRows', label: 'tag rows', value: report.insertedTagRows },
    { key: 'discoveredTagCount', label: 'discovered tags', value: report.discoveredTagCount },
    { key: 'updatedDiscoveredTags', label: 'updated tags', value: report.updatedDiscoveredTags },
    { key: 'fallbackTagRowCount', label: 'fallback rows', value: report.fallbackTagRowCount },
    { key: 'latestSnapshotCount', label: 'latest snapshots', value: report.latestSnapshotCount },
    { key: 'sourceHash', label: 'sourceHash', value: report.sourceHash },
  ];
});

const historyColumns = [
  { key: 'tag', label: '版本' },
  { key: 'commit', label: 'Commit' },
  { key: 'type', label: '类型' },
  { key: 'date', label: '时间' },
  { key: 'count', label: '数量' },
];

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
  } catch {
    return dateStr;
  }
}

function formatBytes(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = -1;

  do {
    size /= 1024;
    unitIndex += 1;
  } while (size >= 1024 && unitIndex < units.length - 1);

  const digits = size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

function r2FileUri(name: string) {
  return `r2://R2_DATA/hearthstone/hsdata/data/${name}`;
}

function inferSourceTagFromName(name: string) {
  const match = name.match(/(?:^|[^\d])(\d{5,})(?:[^\d]|$)/);
  const rawValue = match?.[1];

  if (!rawValue) {
    return null;
  }

  const sourceTag = Number(rawValue);
  return Number.isSafeInteger(sourceTag) && sourceTag >= 0 ? sourceTag : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败';
}

async function loadState() {
  loadingState.value = true;
  try {
    const result = await $orpc.hearthstone.dataSource.hsdata.getState();
    state.value = result;
  } catch (error) {
    console.error('Failed to load state:', error);
  } finally {
    loadingState.value = false;
  }
}

async function loadFiles() {
  loadingFiles.value = true;
  try {
    const result = await $orpc.hearthstone.dataSource.hsdata.listFiles();
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

async function loadR2File(file: HsdataFile) {
  loadingR2FileName.value = file.name;
  importError.value = '';

  try {
    const result = await $orpc.hearthstone.dataSource.hsdata.readFile({ name: file.name });
    importXml.value = result.content;
    importFileName.value = result.name;
    importForm.sourceUri = r2FileUri(result.name);

    const sourceTag = inferSourceTagFromName(result.name);
    if (sourceTag != null) {
      importForm.sourceTag = sourceTag;
    }
  } catch (error) {
    console.error('Failed to load hsdata file:', error);
    importError.value = getErrorMessage(error);
  } finally {
    loadingR2FileName.value = null;
  }
}

function handleXmlFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  importError.value = '';
  importFileName.value = file.name;

  const reader = new FileReader();
  reader.onload = readerEvent => {
    const content = readerEvent.target?.result;
    importXml.value = typeof content === 'string' ? content : '';

    if (importForm.sourceUri.trim().length === 0) {
      importForm.sourceUri = `file://${file.name}`;
    }

    const sourceTag = inferSourceTagFromName(file.name);
    if (sourceTag != null) {
      importForm.sourceTag = sourceTag;
    }
  };
  reader.onerror = () => {
    importError.value = '文件读取失败';
  };
  reader.readAsText(file);
}

function resetImportForm() {
  importXml.value = '';
  importFileName.value = '';
  importError.value = '';
  importResult.value = null;
  importForm.sourceTag = 0;
  importForm.sourceCommit = '';
  importForm.sourceUri = '';
  importForm.dryRun = true;
  importForm.force = false;
}

async function submitImport() {
  if (!canImport.value) {
    return;
  }

  if (importForm.sourceTag == null) {
    return;
  }

  importing.value = true;
  importError.value = '';
  importResult.value = null;

  try {
    const sourceCommit = importForm.sourceCommit.trim();
    const sourceUri = importForm.sourceUri.trim();
    const result = await $orpc.hearthstone.dataSource.hsdata.importArchive({
      xml:          importXml.value,
      sourceTag:    importForm.sourceTag,
      sourceCommit: sourceCommit.length > 0 ? sourceCommit : null,
      sourceUri:    sourceUri.length > 0 ? sourceUri : null,
      dryRun:       importForm.dryRun,
      force:        importForm.force,
    });

    importResult.value = result;

    if (!result.dryRun) {
      await loadState();
    }
  } catch (error) {
    console.error('Failed to import hsdata archive:', error);
    importError.value = getErrorMessage(error);
  } finally {
    importing.value = false;
  }
}

onMounted(() => {
  void loadState();
  void loadFiles();
});
</script>
