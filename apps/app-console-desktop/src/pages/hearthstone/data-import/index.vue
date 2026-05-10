<template>
  <div class="space-y-4">
    <UCard>
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-download" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">hsdata 导入与投影</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            选择数据版本后执行导入和投影。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="同步远端版本"
            icon="i-lucide-cloud-sync"
            color="primary"
            variant="soft"
            :loading="syncing"
            :disabled="!state?.repoPath || loadingState || loadingFiles || importing || projecting"
            @click="syncRemoteVersions"
          />
          <UButton label="管理数据源" icon="i-lucide-database" color="neutral" variant="ghost" to="/hearthstone/data-source" />
        </div>
      </div>
    </UCard>

    <UAlert
      v-if="!state?.repoPath"
      color="warning"
      variant="soft"
      icon="i-lucide-folder-search"
      :ui="{ icon: 'sm:self-center' }"
    >
      <template #description>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>尚未配置 hsdata 数据源路径，请先在设置页完成设置。</span>
          <div class="sm:ml-auto">
            <UButton
              label="打开设置"
              icon="i-lucide-settings"
              color="warning"
              variant="soft"
              :to="{ path: '/settings', query: { game: 'hearthstone' } }"
            />
          </div>
        </div>
      </template>
    </UAlert>

    <UAlert
      v-if="sourceError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="sourceError"
    />

    <div class="grid gap-4 xl:grid-cols-3">
      <div class="space-y-4 xl:col-span-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">数据导入</div>
                <p class="mt-1 text-xs text-muted">
                  选择一个可用版本后执行导入，完成后可继续执行投影。
                </p>
              </div>
              <UBadge :label="importForm.dryRun ? 'Dry run' : 'Write mode'" :color="importForm.dryRun ? 'neutral' : 'warning'" variant="soft" />
            </div>
          </template>

          <div class="space-y-4">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">选中来源</div>
                <div class="mt-1 break-all font-mono text-sm">{{ selectedName }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceTag</div>
                <div class="mt-1 break-all font-mono text-sm">{{ importForm.sourceTag ?? '-' }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceCommit</div>
                <div class="mt-1 break-all font-mono text-sm">{{ selectedCommit }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceUri</div>
                <div class="mt-1 break-all font-mono text-sm">{{ selectedUri }}</div>
              </div>
            </div>

            <div v-if="selectedFile" class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">来源信息</div>
              <div class="mt-1 flex flex-wrap gap-3 text-sm">
                <span>{{ selectedFile.shortCommit }}</span>
                <span>{{ formatHsdataBytes(selectedFile.size) }}</span>
                <span v-if="selectedFile.time">{{ formatHsdataDate(selectedFile.time) }}</span>
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <label class="flex items-start gap-3 rounded-lg border border-default p-3">
                <input v-model="importForm.dryRun" type="checkbox" class="mt-0.5 size-4 rounded border-default">
                <span>
                  <span class="block text-sm font-medium">Dry run</span>
                  <span class="text-xs text-muted">默认开启，仅进行解析和统计。</span>
                </span>
              </label>

              <label class="flex items-start gap-3 rounded-lg border border-default p-3">
                <input v-model="importForm.force" type="checkbox" class="mt-0.5 size-4 rounded border-default">
                <span>
                  <span class="block text-sm font-medium">Force</span>
                  <span class="text-xs text-muted">允许重新导入同版本但内容不同的归档。</span>
                </span>
              </label>
            </div>

            <UAlert v-if="importError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="importError" />

            <div v-if="importProgress" class="space-y-3 rounded-lg border border-default p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-medium">导入任务进度</div>
                  <div class="mt-1 text-xs text-muted">{{ importProgress.message }}</div>
                  <div class="mt-1 text-xs text-muted">{{ importProgressStageText }}</div>
                </div>
                <UBadge :label="importProgressPhaseLabel" :color="importProgress.phase === 'failed' ? 'error' : importProgress.phase === 'completed' ? 'success' : 'primary'" variant="soft" />
              </div>

              <div v-if="importProgress.totalChunkCount != null" class="space-y-2">
                <div class="flex items-center justify-between gap-3 text-xs text-muted">
                  <span>{{ importProgressChunkText }}</span>
                  <span>{{ importProgressPercent }}%</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div class="h-full rounded-full bg-primary transition-all duration-300" :style="{ width: `${importProgressPercent}%` }" />
                </div>
              </div>

              <div class="grid gap-3 md:grid-cols-4">
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">总体进度</div>
                  <div class="mt-1 break-all font-mono text-sm">{{ importProgressChunkText }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">jobId</div>
                  <div class="mt-1 break-all font-mono text-sm">{{ importProgress.jobId ?? '-' }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">sourceTag</div>
                  <div class="mt-1 break-all font-mono text-sm">{{ importProgress.sourceTag ?? '-' }}</div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">entities</div>
                  <div class="mt-1 break-all font-mono text-sm">{{ importProgress.totalEntityCount ?? '-' }}</div>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <UButton label="清空选择" icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" @click="resetImportForm" />
              <UButton label="执行导入" icon="i-lucide-play" :loading="importing" :disabled="!canImport" @click="submitImport" />
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">领域数据投影</div>
                <p class="mt-1 text-xs text-muted">
                  针对已完成导入的 `sourceTag` 手动触发领域投影。
                </p>
              </div>
              <UBadge :label="projectForm.dryRun ? 'Dry run' : 'Write mode'" :color="projectForm.dryRun ? 'neutral' : 'warning'" variant="soft" />
            </div>
          </template>

          <div class="space-y-4">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div class="rounded-lg border border-default p-3 xl:col-span-2">
                <div class="text-xs text-muted">sourceTag</div>
                <div class="mt-2 flex flex-col gap-2 sm:flex-row">
                  <UInput v-model="projectSourceTagInput" type="number" inputmode="numeric" placeholder="输入已完成导入的 sourceTag" class="flex-1" />
                  <UButton label="使用当前选择" icon="i-lucide-arrow-down-to-line" color="neutral" variant="soft" :disabled="importForm.sourceTag == null" @click="useSelectedSourceTag" />
                </div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">可执行条件</div>
                <div class="mt-1 text-sm text-muted">`source_versions.status = completed`</div>
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <label class="flex items-start gap-3 rounded-lg border border-default p-3">
                <input v-model="projectForm.dryRun" type="checkbox" class="mt-0.5 size-4 rounded border-default">
                <span>
                  <span class="block text-sm font-medium">Dry run</span>
                  <span class="text-xs text-muted">默认开启，仅进行投影预览和统计。</span>
                </span>
              </label>

              <label class="flex items-start gap-3 rounded-lg border border-default p-3">
                <input v-model="projectForm.force" type="checkbox" class="mt-0.5 size-4 rounded border-default">
                <span>
                  <span class="block text-sm font-medium">Force</span>
                  <span class="text-xs text-muted">即使当前结果没有变化，也允许重新执行。</span>
                </span>
              </label>
            </div>

            <UAlert v-if="projectError" color="error" variant="soft" icon="i-lucide-circle-alert" :description="projectError" />

            <div class="flex flex-wrap justify-end gap-2">
              <UButton label="清空投影参数" icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" @click="resetProjectForm" />
              <UButton label="执行投影" icon="i-lucide-waypoints" :loading="projecting" :disabled="!canProject" @click="submitProject" />
            </div>
          </div>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-medium">可用版本</div>
              <p class="mt-1 text-xs text-muted">展示当前可选择的数据版本。</p>
            </div>
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loadingFiles" :disabled="!state?.repoPath" @click="loadFiles" />
          </div>
        </template>

        <div v-if="loadingFiles && files.length === 0" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
        </div>
        <div v-else-if="files.length === 0" class="py-8 text-center text-sm text-muted">暂无可导入版本</div>
        <div v-else class="max-h-136 space-y-2 overflow-y-auto pr-1">
          <div
            v-for="file in files"
            :key="file.id"
            class="flex items-center gap-2 rounded-lg border border-default p-3"
            :class="importForm.id === file.id ? 'ring-2 ring-primary' : ''"
          >
            <button type="button" class="min-w-0 flex-1 text-left" @click="selectSource(file)">
              <div class="truncate font-mono text-xs">{{ file.name }}</div>
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                <span v-if="file.sourceTag != null">{{ file.sourceTag }}</span>
                <span>{{ file.shortCommit }}</span>
                <span>{{ formatHsdataBytes(file.size) }}</span>
                <span v-if="file.time">{{ formatHsdataDate(file.time) }}</span>
              </div>
            </button>
            <UButton :label="importForm.id === file.id ? '已选中' : '选择'" size="xs" :color="importForm.id === file.id ? 'primary' : 'neutral'" variant="soft" @click="selectSource(file)" />
          </div>
        </div>
      </UCard>
    </div>

    <UCard v-if="importResult">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">导入报告</span>
          <div class="flex flex-wrap gap-2">
            <UBadge :label="importResult.dryRun ? 'Dry run' : 'Written'" :color="importResult.dryRun ? 'neutral' : 'success'" variant="soft" />
            <UBadge v-if="importResult.skipped" label="Skipped" color="warning" variant="soft" />
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div v-for="metric in reportMetrics" :key="metric.key" class="rounded-lg border border-default p-3">
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

    <UCard v-if="projectResult">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">投影报告</span>
          <div class="flex flex-wrap gap-2">
            <UBadge :label="projectResult.dryRun ? 'Dry run' : 'Written'" :color="projectResult.dryRun ? 'neutral' : 'success'" variant="soft" />
            <UBadge v-if="projectResult.skipped" label="Skipped" color="warning" variant="soft" />
          </div>
        </div>
      </template>

      <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div v-for="metric in projectReportMetrics" :key="metric.key" class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">{{ metric.label }}</div>
          <div class="mt-1 break-all font-mono text-sm">{{ metric.value }}</div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { useApiClient } from '~/composables/useApiClient';
import {
  formatHsdataBytes,
  formatHsdataDate,
  getHsdataErrorMessage,
  getHsdataRepoState,
  importHsdataSource,
  listenHsdataImportProgress,
  listHsdataSources,
  syncHsdataRemoteVersions,
} from '~/composables/useHsdataRepo';
import type {
  HsdataFile,
  HsdataImportProgressEvent,
  HsdataImportReport,
  HsdataProjectReport,
  HsdataRepoState,
  ReportMetric,
} from '~/composables/useHsdataRepo';

definePageMeta({
  layout: 'admin',
  title:  '数据导入',
});

const route = useRoute();
const orpc = useApiClient();

const state = ref<HsdataRepoState | null>(null);
const loadingState = ref(false);
const stateError = ref('');
const files = ref<HsdataFile[]>([]);
const loadingFiles = ref(false);
const filesError = ref('');
const importError = ref('');
const importing = ref(false);
const activeImportSourceId = ref<string | null>(null);
const importProgress = ref<HsdataImportProgressEvent | null>(null);
const importResult = ref<HsdataImportReport | null>(null);
const projectError = ref('');
const projecting = ref(false);
const projectResult = ref<HsdataProjectReport | null>(null);
const syncing = ref(false);
const toast = useToast();
let stopHsdataImportProgressListener: (() => void) | null = null;

const importForm = reactive({
  id:           '',
  name:         '',
  sourceTag:    null as number | null,
  sourceCommit: '',
  sourceUri:    '',
  dryRun:       true,
  force:        false,
});

const projectForm = reactive({
  sourceTag: null as number | null,
  dryRun:    true,
  force:     false,
});

const sourceError = computed(() => {
  if (stateError.value.length > 0) {
    return stateError.value;
  }

  if (filesError.value.length > 0) {
    return filesError.value;
  }

  return '';
});

const selectedFile = computed(() => files.value.find(file => file.id === importForm.id) ?? null);
const selectedName = computed(() => importForm.name.length > 0 ? importForm.name : '-');
const selectedCommit = computed(() => importForm.sourceCommit.length > 0 ? importForm.sourceCommit : '-');
const selectedUri = computed(() => importForm.sourceUri.length > 0 ? importForm.sourceUri : '-');

const canImport = computed(() => Boolean(state.value?.repoPath) && importForm.id.trim().length > 0 && !importing.value);
const canProject = computed(() => projectForm.sourceTag != null && !projecting.value);
const importProgressPhaseLabel = computed(() => {
  switch (importProgress.value?.phase) {
  case 'preparing': return '本地准备';
  case 'prepared': return '准备完成';
  case 'creating_job': return '创建任务';
  case 'uploading': return '上传中';
  case 'ready_to_finalize': return '等待完成';
  case 'finalizing': return '收尾中';
  case 'completed': return '已完成';
  case 'failed': return '失败';
  default: return '进行中';
  }
});
const importProgressStageText = computed(() => {
  switch (importProgress.value?.phase) {
  case 'preparing':
    return '正在读取所选版本并准备开始导入。';
  case 'prepared':
    return '导入准备已完成，即将开始处理。';
  case 'creating_job':
    return '正在初始化导入任务。';
  case 'uploading':
    return '正在处理并传输导入数据。';
  case 'ready_to_finalize':
    return '导入数据已准备完成，正在进入最后阶段。';
  case 'finalizing':
    return '正在写入最终导入结果。';
  case 'completed':
    return '导入任务已经完成，可以继续执行后续投影。';
  case 'failed':
    return '导入任务已停止，请根据上方错误信息排查。';
  default:
    return '正在等待下一条任务进度更新。';
  }
});
const importProgressPercent = computed(() => {
  const progress = importProgress.value;

  if (!progress || progress.totalChunkCount == null || progress.totalChunkCount <= 0) {
    return progress?.phase === 'completed' ? 100 : 0;
  }

  const completed = progress.completedChunkCount ?? 0;
  return Math.max(0, Math.min(100, Math.round((completed / progress.totalChunkCount) * 100)));
});
const importProgressChunkText = computed(() => {
  const progress = importProgress.value;

  if (!progress || progress.totalChunkCount == null) {
    return '-';
  }

  return `${progress.completedChunkCount ?? 0} / ${progress.totalChunkCount}`;
});

const projectSourceTagInput = computed({
  get() {
    return projectForm.sourceTag == null ? '' : String(projectForm.sourceTag);
  },
  set(value: string | number) {
    const raw = typeof value === 'number' ? String(value) : value.trim();

    if (raw.length === 0) {
      projectForm.sourceTag = null;
      return;
    }

    const parsed = Number(raw);
    projectForm.sourceTag = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  },
});

const reportMetrics = computed<ReportMetric[]>(() => {
  const report = importResult.value;

  if (!report) {
    return [];
  }

  return [
    { key: 'sourceTag', label: 'sourceTag', value: report.sourceTag },
    { key: 'build', label: 'version', value: report.build },
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

const projectReportMetrics = computed<ReportMetric[]>(() => {
  const report = projectResult.value;

  if (!report) {
    return [];
  }

  return [
    { key: 'sourceTag', label: 'sourceTag', value: report.sourceTag },
    { key: 'build', label: 'version', value: report.build },
    { key: 'snapshotCount', label: 'snapshots', value: report.snapshotCount },
    { key: 'insertedEntities', label: 'inserted entities', value: report.insertedEntities },
    { key: 'reusedEntities', label: 'reused entities', value: report.reusedEntities },
    { key: 'updatedEntities', label: 'updated entities', value: report.updatedEntities },
    { key: 'insertedLocalizations', label: 'inserted locs', value: report.insertedLocalizations },
    { key: 'reusedLocalizations', label: 'reused locs', value: report.reusedLocalizations },
    { key: 'updatedLocalizations', label: 'updated locs', value: report.updatedLocalizations },
    { key: 'insertedRelations', label: 'inserted relations', value: report.insertedRelations },
    { key: 'updatedRelations', label: 'updated relations', value: report.updatedRelations },
    { key: 'unprojectedTagCount', label: 'unprojected tags', value: report.unprojectedTagCount },
  ];
});

function selectSource(file: HsdataFile) {
  importError.value = '';
  projectError.value = '';
  importForm.id = file.id;
  importForm.name = file.name;
  importForm.sourceTag = file.sourceTag ?? null;
  importForm.sourceCommit = file.sourceCommit;
  importForm.sourceUri = file.sourceUri;
  projectForm.sourceTag = importForm.sourceTag;
}

function applyRouteSelection() {
  const selectedId = typeof route.query.source === 'string' ? route.query.source : null;

  if (!selectedId) {
    return;
  }

  const file = files.value.find(item => item.id === selectedId);
  if (file) {
    selectSource(file);
  }
}

function restoreSelection(selectedId: string | null) {
  if (selectedId) {
    const file = files.value.find(item => item.id === selectedId);
    if (file) {
      selectSource(file);
      return;
    }

    const selectedTag = importForm.sourceTag;
    resetImportForm();
    if (projectForm.sourceTag === selectedTag) {
      projectForm.sourceTag = null;
    }
    return;
  }

  applyRouteSelection();
}

function resetImportForm() {
  activeImportSourceId.value = null;
  importError.value = '';
  importProgress.value = null;
  importResult.value = null;
  importForm.id = '';
  importForm.name = '';
  importForm.sourceTag = null;
  importForm.sourceCommit = '';
  importForm.sourceUri = '';
  importForm.dryRun = true;
  importForm.force = false;
}

function resetProjectForm() {
  projectError.value = '';
  projectResult.value = null;
  projectForm.sourceTag = importForm.sourceTag;
  projectForm.dryRun = true;
  projectForm.force = false;
}

function useSelectedSourceTag() {
  projectForm.sourceTag = importForm.sourceTag;
}

async function loadState() {
  loadingState.value = true;
  stateError.value = '';

  try {
    state.value = await getHsdataRepoState();
  } catch (error) {
    console.error('Failed to load hsdata state:', error);
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
    console.error('Failed to load hsdata sources:', error);
    filesError.value = getHsdataErrorMessage(error);
    files.value = [];
  } finally {
    loadingFiles.value = false;
  }
}

async function reloadAll(selectedId: string | null = null) {
  await loadState();
  await loadFiles();
  restoreSelection(selectedId);
}

async function syncRemoteVersions() {
  const selectedId = importForm.id.length > 0 ? importForm.id : null;

  syncing.value = true;
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  try {
    const result = await syncHsdataRemoteVersions();
    await reloadAll(selectedId);
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

async function submitImport() {
  if (!canImport.value) {
    return;
  }

  importing.value = true;
  activeImportSourceId.value = importForm.id;
  importError.value = '';
  importProgress.value = null;
  importResult.value = null;

  try {
    const result = await importHsdataSource(
      importForm.id,
      importForm.dryRun,
      importForm.force,
    );

    importForm.sourceTag = result.sourceTag;
    importResult.value = result;
    projectForm.sourceTag = result.sourceTag;
  } catch (error) {
    console.error('Failed to import hsdata source:', error);
    importError.value = getHsdataErrorMessage(error);
  } finally {
    importing.value = false;
  }
}

async function submitProject() {
  if (!canProject.value || projectForm.sourceTag == null) {
    return;
  }

  projecting.value = true;
  projectError.value = '';
  projectResult.value = null;

  try {
    projectResult.value = await orpc.hearthstone.dataSource.hsdata.projectSourceVersion({
      sourceTag: projectForm.sourceTag,
      dryRun:    projectForm.dryRun,
      force:     projectForm.force,
    });
  } catch (error) {
    console.error('Failed to project hsdata source version:', error);
    projectError.value = getHsdataErrorMessage(error);
  } finally {
    projecting.value = false;
  }
}

watch(() => route.query.source, () => {
  applyRouteSelection();
});

onMounted(async () => {
  stopHsdataImportProgressListener = await listenHsdataImportProgress(progress => {
    if (
      progress.sourceId !== activeImportSourceId.value
      && progress.sourceId !== importForm.id
      && progress.sourceId !== importProgress.value?.sourceId
    ) {
      return;
    }

    importProgress.value = progress;
  });

  await reloadAll();
});

onBeforeUnmount(() => {
  stopHsdataImportProgressListener?.();
  stopHsdataImportProgressListener = null;
});
</script>
