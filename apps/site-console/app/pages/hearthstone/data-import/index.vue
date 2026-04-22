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
            从 R2 归档执行原始归档导入，并手动触发领域投影；来源状态、同步历史和归档总览请查看数据源页面。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            v-if="state?.tag"
            :label="`当前版本 ${state.tag}`"
            color="primary"
            variant="soft"
          />
          <UBadge
            v-if="state?.short"
            :label="state.short"
            color="neutral"
            variant="outline"
          />
          <UButton
            label="查看数据源"
            icon="i-lucide-database"
            color="neutral"
            variant="ghost"
            to="/hearthstone/data-source"
          />
        </div>
      </div>
    </UCard>

    <div class="grid gap-4 xl:grid-cols-3">
      <div class="space-y-4 xl:col-span-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">原始归档导入</div>
                <p class="mt-1 text-xs text-muted">
                  仅允许从 R2 中选择 `CardDefs.xml` 归档，服务端会直接读取对象并调用 `importArchive`。
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
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">选中文件</div>
                <div class="mt-1 break-all font-mono text-sm">{{ importForm.name || '-' }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceTag</div>
                <div class="mt-1 break-all font-mono text-sm">{{ importForm.sourceTag ?? '-' }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceCommit</div>
                <div class="mt-1 break-all font-mono text-sm">{{ importForm.sourceCommit || '-' }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceUri</div>
                <div class="mt-1 break-all font-mono text-sm">{{ importForm.sourceUri || '-' }}</div>
              </div>
            </div>

            <div v-if="selectedFile" class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">归档信息</div>
              <div class="mt-1 flex flex-wrap gap-3 text-sm">
                <span>{{ formatHsdataBytes(selectedFile.size) }}</span>
                <span v-if="selectedFile.time">{{ formatHsdataDate(selectedFile.time) }}</span>
              </div>
            </div>

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
                  <span class="text-xs text-muted">允许重新导入同版本但内容不同的归档。</span>
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
                label="清空选择"
                icon="i-lucide-rotate-ccw"
                color="neutral"
                variant="ghost"
                @click="resetImportForm"
              />
              <UButton
                label="执行导入"
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
                <div class="font-medium">领域数据投影</div>
                <p class="mt-1 text-xs text-muted">
                  针对已完成导入的 `sourceTag` 手动触发领域投影，生成 `entities`、`entity_localizations` 和 `entity_relations`。
                </p>
              </div>
              <UBadge
                :label="projectForm.dryRun ? 'Dry run' : 'Write mode'"
                :color="projectForm.dryRun ? 'neutral' : 'warning'"
                variant="soft"
              />
            </div>
          </template>

          <div class="space-y-4">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-lg border border-default p-3 xl:col-span-2">
                <div class="text-xs text-muted">sourceTag</div>
                <div class="mt-2 flex flex-col gap-2 sm:flex-row">
                  <UInput
                    v-model="projectSourceTagInput"
                    type="number"
                    inputmode="numeric"
                    placeholder="输入已完成导入的 sourceTag"
                    class="flex-1"
                  />
                  <UButton
                    label="使用当前选择"
                    icon="i-lucide-arrow-down-to-line"
                    color="neutral"
                    variant="soft"
                    :disabled="importForm.sourceTag == null"
                    @click="useSelectedSourceTag"
                  />
                </div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">当前来源状态</div>
                <div class="mt-1 break-all font-mono text-sm">{{ state?.tag ?? '-' }}</div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">可执行条件</div>
                <div class="mt-1 text-sm text-muted">`source_versions.status = completed`</div>
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <label class="flex items-start gap-3 rounded-lg border border-default p-3">
                <input
                  v-model="projectForm.dryRun"
                  type="checkbox"
                  class="mt-0.5 size-4 rounded border-default"
                >
                <span>
                  <span class="block text-sm font-medium">Dry run</span>
                  <span class="text-xs text-muted">默认开启，只投影和统计，不写领域表。</span>
                </span>
              </label>

              <label class="flex items-start gap-3 rounded-lg border border-default p-3">
                <input
                  v-model="projectForm.force"
                  type="checkbox"
                  class="mt-0.5 size-4 rounded border-default"
                >
                <span>
                  <span class="block text-sm font-medium">Force</span>
                  <span class="text-xs text-muted">即使当前结果无变化，也允许重新执行一轮写库。</span>
                </span>
              </label>
            </div>

            <UAlert
              v-if="projectError"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :description="projectError"
            />

            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                label="清空投影参数"
                icon="i-lucide-rotate-ccw"
                color="neutral"
                variant="ghost"
                @click="resetProjectForm"
              />
              <UButton
                label="执行投影"
                icon="i-lucide-waypoints"
                :loading="projecting"
                :disabled="!canProject"
                @click="submitProject"
              />
            </div>
          </div>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="font-medium">R2 文件</div>
              <p class="mt-1 text-xs text-muted">
                从 `R2_DATA/hearthstone/hsdata/data/` 读取归档 XML。
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
            :class="importForm.name === file.name ? 'ring-2 ring-primary' : ''"
          >
            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              @click="selectR2File(file)"
            >
              <div class="truncate font-mono text-xs">{{ file.name }}</div>
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                <span>{{ formatHsdataBytes(file.size) }}</span>
                <span v-if="file.time">{{ formatHsdataDate(file.time) }}</span>
              </div>
            </button>
            <UButton
              :label="importForm.name === file.name ? '已选中' : '选择'"
              size="xs"
              :color="importForm.name === file.name ? 'primary' : 'neutral'"
              variant="soft"
              @click="selectR2File(file)"
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

    <UCard v-if="projectResult">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="font-medium">投影报告</span>
          <div class="flex flex-wrap gap-2">
            <UBadge
              :label="projectResult.dryRun ? 'Dry run' : 'Written'"
              :color="projectResult.dryRun ? 'neutral' : 'success'"
              variant="soft"
            />
            <UBadge
              v-if="projectResult.skipped"
              label="Skipped"
              color="warning"
              variant="soft"
            />
          </div>
        </div>
      </template>

      <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div
          v-for="metric in projectReportMetrics"
          :key="metric.key"
          class="rounded-lg border border-default p-3"
        >
          <div class="text-xs text-muted">{{ metric.label }}</div>
          <div class="mt-1 break-all font-mono text-sm">{{ metric.value }}</div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import {
  formatHsdataBytes,
  formatHsdataDate,
  getHsdataErrorMessage,
  inferHsdataSourceCommit,
  inferHsdataSourceTag,
  r2HsdataFileUri,
} from '~/composables/hearthstone-hsdata';
import type {
  HsdataFile,
  HsdataImportReport,
  HsdataProjectReport,
  HsdataSourceState,
  ReportMetric,
} from '~/composables/hearthstone-hsdata';

definePageMeta({
  layout: 'admin',
  title:  '数据导入',
});

const { $orpc } = useNuxtApp();

const state = ref<HsdataSourceState | null>(null);
const loadingState = ref(false);

const files = ref<HsdataFile[]>([]);
const loadingFiles = ref(false);
const importError = ref('');
const importing = ref(false);
const importResult = ref<HsdataImportReport | null>(null);
const projectError = ref('');
const projecting = ref(false);
const projectResult = ref<HsdataProjectReport | null>(null);

const importForm = reactive({
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

const selectedFile = computed(() => {
  return files.value.find(file => file.name === importForm.name) ?? null;
});

const canImport = computed(() =>
  importForm.name.trim().length > 0
  && !importing.value,
);

const canProject = computed(() =>
  projectForm.sourceTag != null
  && !projecting.value,
);

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

const projectReportMetrics = computed<ReportMetric[]>(() => {
  const report = projectResult.value;

  if (!report) {
    return [];
  }

  return [
    { key: 'sourceTag', label: 'sourceTag', value: report.sourceTag },
    { key: 'build', label: 'build', value: report.build },
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

async function loadState() {
  loadingState.value = true;

  try {
    state.value = await $orpc.hearthstone.dataSource.hsdata.getState();
  } catch (error) {
    console.error('Failed to load hsdata state:', error);
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

function selectR2File(file: HsdataFile) {
  importError.value = '';
  projectError.value = '';

  importForm.name = file.name;
  importForm.sourceTag = inferHsdataSourceTag(file.name);
  importForm.sourceCommit = inferHsdataSourceCommit(file.name) ?? '';
  importForm.sourceUri = r2HsdataFileUri(file.name);
  projectForm.sourceTag = importForm.sourceTag;
}

function resetImportForm() {
  importError.value = '';
  importResult.value = null;
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

async function submitImport() {
  if (!canImport.value) {
    return;
  }

  importing.value = true;
  importError.value = '';
  importResult.value = null;

  try {
    importResult.value = await $orpc.hearthstone.dataSource.hsdata.importArchive({
      name:   importForm.name,
      dryRun: importForm.dryRun,
      force:  importForm.force,
    });

    projectForm.sourceTag = importResult.value.sourceTag;

    if (!importResult.value.dryRun) {
      await loadState();
    }
  } catch (error) {
    console.error('Failed to import hsdata archive:', error);
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
    projectResult.value = await $orpc.hearthstone.dataSource.hsdata.projectSourceVersion({
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

onMounted(() => {
  void loadState();
  void loadFiles();
});
</script>
