<template>
  <div class="space-y-4">
    <UCard>
      <div
        class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
      >
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-download" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">hsdata 导入与投影</h1>
          </div>
          <p class="mt-1 text-sm text-muted">选择数据版本后执行导入和投影。</p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="同步远端版本"
            icon="i-lucide-cloud-sync"
            color="primary"
            variant="soft"
            :loading="syncing"
            :disabled="
              !state?.repoPath ||
              loadingState ||
              loadingFiles ||
              loadingSourceVersions ||
              importing ||
              projecting
            "
            @click="syncRemoteVersions"
          />
          <UButton
            label="管理数据源"
            icon="i-lucide-database"
            color="neutral"
            variant="ghost"
            to="/hearthstone/data-source"
          />
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
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
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

    <UAlert
      v-if="sourceVersionError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="`sourceTag 状态加载失败：${sourceVersionError}`"
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
                <div class="text-xs text-muted">选中来源</div>
                <div class="mt-1 break-all font-mono text-sm">
                  {{ selectedName }}
                </div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceTag</div>
                <div class="mt-2">
                  <UBadge
                    v-if="importForm.sourceTag != null"
                    :label="String(importForm.sourceTag)"
                    color="primary"
                    variant="soft"
                  />
                  <div v-else class="break-all font-mono text-sm">-</div>
                </div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceCommit</div>
                <div class="mt-1 break-all font-mono text-sm">
                  {{ selectedCommit }}
                </div>
              </div>
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">sourceUri</div>
                <div class="mt-1 break-all font-mono text-sm">
                  {{ selectedUri }}
                </div>
              </div>
            </div>

            <div
              v-if="selectedFile"
              class="rounded-lg border border-default p-3"
            >
              <div class="space-y-3">
                <div>
                  <div class="text-xs text-muted">来源信息</div>
                  <div class="mt-1 flex flex-wrap gap-3 text-sm">
                    <span>{{ selectedFile.shortCommit }}</span>
                    <span>{{ formatHsdataBytes(selectedFile.size) }}</span>
                    <span v-if="selectedFile.time">{{
                      formatHsdataDate(selectedFile.time)
                    }}</span>
                  </div>
                </div>

                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div class="rounded-lg border border-default p-3">
                    <div class="text-xs text-muted">导入状态</div>
                    <div class="mt-2">
                      <UBadge
                        :label="selectedImportBadge.label"
                        :color="selectedImportBadge.color"
                        :variant="selectedImportBadge.variant"
                      />
                    </div>
                  </div>
                  <div class="rounded-lg border border-default p-3">
                    <div class="text-xs text-muted">导入时间</div>
                    <div class="mt-1 break-all font-mono text-sm">
                      {{
                        formatHsdataDate(
                          selectedSourceVersion?.importedAt ?? undefined,
                        )
                      }}
                    </div>
                  </div>
                  <div class="rounded-lg border border-default p-3">
                    <div class="text-xs text-muted">投影状态</div>
                    <div class="mt-2">
                      <UBadge
                        :label="selectedProjectionBadge.label"
                        :color="selectedProjectionBadge.color"
                        :variant="selectedProjectionBadge.variant"
                      />
                    </div>
                  </div>
                  <div class="rounded-lg border border-default p-3">
                    <div class="text-xs text-muted">投影时间</div>
                    <div class="mt-1 break-all font-mono text-sm">
                      {{
                        formatHsdataDate(
                          selectedSourceVersion?.projectedAt ?? undefined,
                        )
                      }}
                    </div>
                  </div>
                </div>

                <div class="text-xs text-muted">
                  {{ selectedSourceStatusText }}
                </div>

                <UAlert
                  v-if="selectedSourceVersion?.projectionError"
                  color="error"
                  variant="soft"
                  icon="i-lucide-circle-alert"
                  :description="selectedSourceVersion.projectionError"
                />
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <label
                class="flex items-start gap-3 rounded-lg border border-default p-3"
              >
                <input
                  v-model="importForm.dryRun"
                  type="checkbox"
                  class="mt-0.5 size-4 rounded border-default"
                >
                <span>
                  <span class="block text-sm font-medium">Dry run</span>
                  <span class="text-xs text-muted"
                    >默认开启，仅进行解析和统计。</span
                  >
                </span>
              </label>

              <label
                class="flex items-start gap-3 rounded-lg border border-default p-3"
              >
                <input
                  v-model="importForm.force"
                  type="checkbox"
                  class="mt-0.5 size-4 rounded border-default"
                >
                <span>
                  <span class="block text-sm font-medium">Force</span>
                  <span class="text-xs text-muted"
                    >允许重新导入同版本但内容不同的归档。</span
                  >
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

            <div
              v-if="importProgress"
              class="space-y-3 rounded-lg border border-default p-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div class="text-sm font-medium">导入任务进度</div>
                  <div class="mt-1 text-xs text-muted">
                    {{ importProgress.message }}
                  </div>
                  <div class="mt-1 text-xs text-muted">
                    {{ importProgressStageText }}
                  </div>
                </div>
                <UBadge
                  :label="importProgressPhaseLabel"
                  :color="
                    importProgress.phase === 'failed'
                      ? 'error'
                      : importProgress.phase === 'completed'
                        ? 'success'
                        : 'primary'
                  "
                  variant="soft"
                />
              </div>

              <div
                v-if="importProgress.totalChunkCount != null"
                class="space-y-2"
              >
                <div
                  class="flex items-center justify-between gap-3 text-xs text-muted"
                >
                  <span>{{ importProgressChunkText }}</span>
                  <span>{{ importProgressPercent }}%</span>
                </div>
                <div class="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all duration-300"
                    :style="{ width: `${importProgressPercent}%` }"
                  />
                </div>
              </div>

              <div class="grid gap-3 md:grid-cols-4">
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">总体进度</div>
                  <div class="mt-1 break-all font-mono text-sm">
                    {{ importProgressChunkText }}
                  </div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">jobId</div>
                  <div class="mt-1 break-all font-mono text-sm">
                    {{ importProgress.jobId ?? "-" }}
                  </div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">sourceTag</div>
                  <div class="mt-1 break-all font-mono text-sm">
                    {{ importProgress.sourceTag ?? "-" }}
                  </div>
                </div>
                <div class="rounded-lg border border-default p-3">
                  <div class="text-xs text-muted">entities</div>
                  <div class="mt-1 break-all font-mono text-sm">
                    {{ importProgress.totalEntityCount ?? "-" }}
                  </div>
                </div>
              </div>
            </div>

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
                  针对已完成导入的 `sourceTag` 手动触发领域投影。
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
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                <div class="text-xs text-muted">可执行条件</div>
                <div class="mt-2 flex flex-wrap gap-2">
                  <UBadge
                    :label="projectImportBadge.label"
                    :color="projectImportBadge.color"
                    :variant="projectImportBadge.variant"
                    size="xs"
                  />
                  <UBadge
                    :label="projectProjectionBadge.label"
                    :color="projectProjectionBadge.color"
                    :variant="projectProjectionBadge.variant"
                    size="xs"
                  />
                </div>
                <div class="mt-2 text-xs text-muted">
                  {{ projectConditionText }}
                </div>
                <div
                  v-if="projectSourceVersion?.projectionError"
                  class="mt-2 break-all text-xs text-error"
                >
                  {{ projectSourceVersion.projectionError }}
                </div>
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2">
              <label
                class="flex items-start gap-3 rounded-lg border border-default p-3"
              >
                <input
                  v-model="projectForm.dryRun"
                  type="checkbox"
                  class="mt-0.5 size-4 rounded border-default"
                >
                <span>
                  <span class="block text-sm font-medium">Dry run</span>
                  <span class="text-xs text-muted"
                    >默认开启，仅进行投影预览和统计。</span
                  >
                </span>
              </label>

              <label
                class="flex items-start gap-3 rounded-lg border border-default p-3"
              >
                <input
                  v-model="projectForm.force"
                  type="checkbox"
                  class="mt-0.5 size-4 rounded border-default"
                >
                <span>
                  <span class="block text-sm font-medium">Force</span>
                  <span class="text-xs text-muted"
                    >即使当前结果没有变化，也允许重新执行。</span
                  >
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
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="font-medium">可用版本</div>
                <p class="mt-1 text-xs text-muted">
                  展示当前可选择的数据版本。
                </p>
              </div>
              <UButton
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                :loading="loadingFiles || loadingSourceVersions"
                :disabled="!state?.repoPath"
                @click="reloadSourceList"
              />
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <UButton
                :label="
                  sourceSortOrder === 'desc' ? '倒序 · 大到小' : '顺序 · 小到大'
                "
                :icon="
                  sourceSortOrder === 'desc'
                    ? 'i-lucide-arrow-down-wide-narrow'
                    : 'i-lucide-arrow-up-narrow-wide'
                "
                size="xs"
                color="neutral"
                variant="soft"
                @click="toggleSourceSortOrder"
              />

              <label
                class="flex items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-xs"
              >
                <input
                  v-model="hideImportedSources"
                  type="checkbox"
                  class="size-3.5 rounded border-default"
                >
                <span>隐藏已导入</span>
              </label>

              <label
                class="flex items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-xs"
              >
                <input
                  v-model="hideProjectedSources"
                  type="checkbox"
                  class="size-3.5 rounded border-default"
                >
                <span>隐藏已投影</span>
              </label>

              <span class="text-xs text-muted">{{
                sourceListSummaryText
              }}</span>
            </div>
          </div>
        </template>

        <div
          v-if="loadingFiles && files.length === 0"
          class="flex justify-center py-8"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="size-6 animate-spin text-muted"
          />
        </div>
        <div
          v-else-if="sourceListItems.length === 0"
          class="py-8 text-center text-sm text-muted"
        >
          暂无可导入版本
        </div>
        <div
          v-else-if="visibleSourceListItems.length === 0"
          class="py-8 text-center text-sm text-muted"
        >
          当前筛选条件下暂无可显示版本
        </div>
        <div v-else class="max-h-136 space-y-2 overflow-y-auto pr-1">
          <div
            v-for="item in visibleSourceListItems"
            :key="item.file.id"
            class="flex items-center gap-2 rounded-lg border p-3 transition-colors"
            :class="[
              getSourceListItemClass(
                item.status,
                item.file.sourceTag != null,
                loadingSourceVersions,
                sourceVersionError.length > 0,
              ),
              importForm.id === item.file.id ? 'ring-2 ring-primary' : '',
            ]"
          >
            <button
              type="button"
              class="min-w-0 flex-1 text-left"
              @click="selectSource(item.file)"
            >
              <div class="truncate font-mono text-xs">{{ item.file.name }}</div>
              <div class="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                <span>{{ item.file.shortCommit }}</span>
                <span>{{ formatHsdataBytes(item.file.size) }}</span>
                <span v-if="item.file.time">{{
                  formatHsdataDate(item.file.time)
                }}</span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <UBadge
                  v-if="item.file.sourceTag != null"
                  :label="`sourceTag ${item.file.sourceTag}`"
                  size="xs"
                  color="primary"
                  variant="soft"
                />
                <UBadge
                  v-else
                  label="未解析 sourceTag"
                  size="xs"
                  color="neutral"
                  variant="outline"
                />
                <template v-if="item.file.sourceTag != null">
                  <UBadge
                    :label="
                      getImportStatusBadge(
                        item.status,
                        true,
                        loadingSourceVersions,
                        sourceVersionError.length > 0,
                      ).label
                    "
                    :color="
                      getImportStatusBadge(
                        item.status,
                        true,
                        loadingSourceVersions,
                        sourceVersionError.length > 0,
                      ).color
                    "
                    :variant="
                      getImportStatusBadge(
                        item.status,
                        true,
                        loadingSourceVersions,
                        sourceVersionError.length > 0,
                      ).variant
                    "
                    size="xs"
                  />
                  <UBadge
                    :label="
                      getProjectionStatusBadge(
                        item.status,
                        true,
                        loadingSourceVersions,
                        sourceVersionError.length > 0,
                      ).label
                    "
                    :color="
                      getProjectionStatusBadge(
                        item.status,
                        true,
                        loadingSourceVersions,
                        sourceVersionError.length > 0,
                      ).color
                    "
                    :variant="
                      getProjectionStatusBadge(
                        item.status,
                        true,
                        loadingSourceVersions,
                        sourceVersionError.length > 0,
                      ).variant
                    "
                    size="xs"
                  />
                </template>
              </div>
            </button>
            <UButton
              :label="importForm.id === item.file.id ? '已选中' : '选择'"
              size="xs"
              :color="importForm.id === item.file.id ? 'primary' : 'neutral'"
              variant="soft"
              @click="selectSource(item.file)"
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
            <div class="mt-1 break-all font-mono text-sm">
              {{ metric.value }}
            </div>
          </div>
        </div>

        <div
          v-if="importResult.discoveredTags.length > 0"
          class="rounded-lg border border-default p-3"
        >
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

/** Import status values loaded from `source_versions`. */
type SourceImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Projection status values loaded from `source_versions`. */
type SourceProjectionStatus
  = | 'not_started'
    | 'processing'
    | 'completed'
    | 'failed';

/** One persisted sourceTag status row used by the desktop import page. */
interface HsdataSourceVersionStatus {
  sourceTag:        number;
  build:            number | null;
  sourceCommit:     string;
  sourceUri:        string;
  importStatus:     SourceImportStatus;
  importedAt:       string | null;
  projectionStatus: SourceProjectionStatus;
  projectedAt:      string | null;
  projectionError:  string | null;
}

/** Sort orders supported by the available source list. */
type SourceListSortOrder = 'desc' | 'asc';

/** One badge descriptor rendered for sourceTag statuses. */
interface SourceStatusBadge {
  label:   string;
  color:   'neutral' | 'primary' | 'success' | 'warning' | 'error';
  variant: 'soft' | 'outline';
}

/** One local source row merged with persisted sourceTag status data. */
interface HsdataSourceListItem {
  file:   HsdataFile;
  status: HsdataSourceVersionStatus | null;
}

/** Persisted desktop import page options restored across route switches and app restarts. */
interface HsdataImportPageState {
  version:              1;
  selectedSourceId:     string | null;
  sourceSortOrder:      SourceListSortOrder;
  hideImportedSources:  boolean;
  hideProjectedSources: boolean;
  importDryRun:         boolean;
  importForce:          boolean;
  projectSourceTag:     number | null;
  projectDryRun:        boolean;
  projectForce:         boolean;
}

definePageMeta({
  layout: 'admin',
  title:  '数据导入',
});

const IMPORT_PAGE_STATE_KEY = 'console-desktop-hearthstone-hsdata-import-page';

const route = useRoute();
const orpc = useApiClient();

const state = ref<HsdataRepoState | null>(null);
const loadingState = ref(false);
const stateError = ref('');
const files = ref<HsdataFile[]>([]);
const loadingFiles = ref(false);
const filesError = ref('');
const sourceVersions = ref<HsdataSourceVersionStatus[]>([]);
const loadingSourceVersions = ref(false);
const sourceVersionError = ref('');
const importError = ref('');
const importing = ref(false);
const activeImportSourceId = ref<string | null>(null);
const importProgress = ref<HsdataImportProgressEvent | null>(null);
const importResult = ref<HsdataImportReport | null>(null);
const projectError = ref('');
const projecting = ref(false);
const projectResult = ref<HsdataProjectReport | null>(null);
const syncing = ref(false);
const sourceSortOrder = ref<SourceListSortOrder>('desc');
const hideImportedSources = ref(false);
const hideProjectedSources = ref(false);
const toast = useToast();
const restoredSelectedSourceId = ref<string | null>(null);
const hasRestoredImportPageState = ref(false);
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

const selectedFile = computed(
  () => files.value.find(file => file.id === importForm.id) ?? null,
);
const selectedName = computed(() =>
  importForm.name.length > 0 ? importForm.name : '-',
);
const selectedCommit = computed(() =>
  importForm.sourceCommit.length > 0 ? importForm.sourceCommit : '-',
);
const selectedUri = computed(() =>
  importForm.sourceUri.length > 0 ? importForm.sourceUri : '-',
);
const sourceVersionMap = computed(() => {
  return new Map(
    sourceVersions.value.map(sourceVersion => [
      sourceVersion.sourceTag,
      sourceVersion,
    ]),
  );
});
const sourceListItems = computed<HsdataSourceListItem[]>(() => {
  return files.value.map(file => ({
    file,
    status:
      file.sourceTag == null
        ? null
        : (sourceVersionMap.value.get(file.sourceTag) ?? null),
  }));
});
const visibleSourceListItems = computed<HsdataSourceListItem[]>(() => {
  const filtered = sourceListItems.value.filter(item => {
    if (
      hideImportedSources.value
      && item.status?.importStatus === 'completed'
    ) {
      return false;
    }

    if (
      hideProjectedSources.value
      && item.status?.projectionStatus === 'completed'
    ) {
      return false;
    }

    return true;
  });

  return filtered.sort((left, right) => {
    const leftTag = left.file.sourceTag;
    const rightTag = right.file.sourceTag;

    if (leftTag != null && rightTag != null && leftTag !== rightTag) {
      return sourceSortOrder.value === 'asc'
        ? leftTag - rightTag
        : rightTag - leftTag;
    }

    if (leftTag != null && rightTag == null) {
      return -1;
    }

    if (leftTag == null && rightTag != null) {
      return 1;
    }

    const nameOrder = left.file.name.localeCompare(right.file.name);
    if (nameOrder !== 0) {
      return sourceSortOrder.value === 'asc' ? nameOrder : -nameOrder;
    }

    return sourceSortOrder.value === 'asc'
      ? left.file.shortCommit.localeCompare(right.file.shortCommit)
      : right.file.shortCommit.localeCompare(left.file.shortCommit);
  });
});
const sourceListSummaryText = computed(() => {
  const visibleCount = visibleSourceListItems.value.length;
  const totalCount = sourceListItems.value.length;
  return `显示 ${visibleCount} / ${totalCount}`;
});
const selectedSourceVersion = computed(() => {
  return importForm.sourceTag == null
    ? null
    : (sourceVersionMap.value.get(importForm.sourceTag) ?? null);
});
const projectSourceVersion = computed(() => {
  return projectForm.sourceTag == null
    ? null
    : (sourceVersionMap.value.get(projectForm.sourceTag) ?? null);
});
const selectedImportBadge = computed(() =>
  getImportStatusBadge(
    selectedSourceVersion.value,
    importForm.sourceTag != null,
    loadingSourceVersions.value,
    sourceVersionError.value.length > 0,
  ),
);
const selectedProjectionBadge = computed(() =>
  getProjectionStatusBadge(
    selectedSourceVersion.value,
    importForm.sourceTag != null,
    loadingSourceVersions.value,
    sourceVersionError.value.length > 0,
  ),
);
const projectImportBadge = computed(() =>
  getImportStatusBadge(
    projectSourceVersion.value,
    projectForm.sourceTag != null,
    loadingSourceVersions.value,
    sourceVersionError.value.length > 0,
  ),
);
const projectProjectionBadge = computed(() =>
  getProjectionStatusBadge(
    projectSourceVersion.value,
    projectForm.sourceTag != null,
    loadingSourceVersions.value,
    sourceVersionError.value.length > 0,
  ),
);
const selectedSourceStatusText = computed(() =>
  describeSelectedSourceStatus(
    selectedSourceVersion.value,
    importForm.sourceTag,
    loadingSourceVersions.value,
    sourceVersionError.value.length > 0,
  ),
);
const projectConditionText = computed(() =>
  describeProjectCondition(
    projectSourceVersion.value,
    projectForm.sourceTag,
    loadingSourceVersions.value,
    sourceVersionError.value.length > 0,
  ),
);

const canImport = computed(
  () =>
    Boolean(state.value?.repoPath)
    && importForm.id.trim().length > 0
    && !importing.value,
);
const canProject = computed(
  () => projectForm.sourceTag != null && !projecting.value,
);
const importProgressPhaseLabel = computed(() => {
  switch (importProgress.value?.phase) {
  case 'preparing':
    return '本地准备';
  case 'prepared':
    return '准备完成';
  case 'creating_job':
    return '创建任务';
  case 'uploading':
    return '上传中';
  case 'ready_to_finalize':
    return '等待完成';
  case 'finalizing':
    return '收尾中';
  case 'completed':
    return '已完成';
  case 'failed':
    return '失败';
  default:
    return '进行中';
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

  if (
    !progress
    || progress.totalChunkCount == null
    || progress.totalChunkCount <= 0
  ) {
    return progress?.phase === 'completed' ? 100 : 0;
  }

  const completed = progress.completedChunkCount ?? 0;
  return Math.max(
    0,
    Math.min(100, Math.round((completed / progress.totalChunkCount) * 100)),
  );
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
    projectForm.sourceTag
      = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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
    {
      key:   'insertedSnapshots',
      label: 'inserted snapshots',
      value: report.insertedSnapshots,
    },
    {
      key:   'reusedSnapshots',
      label: 'reused snapshots',
      value: report.reusedSnapshots,
    },
    {
      key:   'insertedTagRows',
      label: 'tag rows',
      value: report.insertedTagRows,
    },
    {
      key:   'discoveredTagCount',
      label: 'discovered tags',
      value: report.discoveredTagCount,
    },
    {
      key:   'updatedDiscoveredTags',
      label: 'updated tags',
      value: report.updatedDiscoveredTags,
    },
    {
      key:   'fallbackTagRowCount',
      label: 'fallback rows',
      value: report.fallbackTagRowCount,
    },
    {
      key:   'latestSnapshotCount',
      label: 'latest snapshots',
      value: report.latestSnapshotCount,
    },
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
    {
      key:   'insertedEntities',
      label: 'inserted entities',
      value: report.insertedEntities,
    },
    {
      key:   'reusedEntities',
      label: 'reused entities',
      value: report.reusedEntities,
    },
    {
      key:   'updatedEntities',
      label: 'updated entities',
      value: report.updatedEntities,
    },
    {
      key:   'insertedLocalizations',
      label: 'inserted locs',
      value: report.insertedLocalizations,
    },
    {
      key:   'reusedLocalizations',
      label: 'reused locs',
      value: report.reusedLocalizations,
    },
    {
      key:   'updatedLocalizations',
      label: 'updated locs',
      value: report.updatedLocalizations,
    },
    {
      key:   'insertedRelations',
      label: 'inserted relations',
      value: report.insertedRelations,
    },
    {
      key:   'updatedRelations',
      label: 'updated relations',
      value: report.updatedRelations,
    },
    {
      key:   'unprojectedTagCount',
      label: 'unprojected tags',
      value: report.unprojectedTagCount,
    },
  ];
});

/** Whether the provided value matches one supported source list sort order. */
function isSourceListSortOrder(value: unknown): value is SourceListSortOrder {
  return value === 'desc' || value === 'asc';
}

/** Default persisted page state used when localStorage has no valid data. */
function createDefaultImportPageState(): HsdataImportPageState {
  return {
    version:              1,
    selectedSourceId:     null,
    sourceSortOrder:      'desc',
    hideImportedSources:  false,
    hideProjectedSources: false,
    importDryRun:         true,
    importForce:          false,
    projectSourceTag:     null,
    projectDryRun:        true,
    projectForce:         false,
  };
}

/** Positive integer sourceTag parsed from persisted page state. */
function parsePersistedSourceTag(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
    ? value
    : null;
}

/** Sanitized localStorage payload for the desktop import page. */
function normalizeImportPageState(value: unknown): HsdataImportPageState {
  const defaults = createDefaultImportPageState();

  if (typeof value !== 'object' || value == null) {
    return defaults;
  }

  const data = value as Record<string, unknown>;
  return {
    version: 1,
    selectedSourceId:
      typeof data.selectedSourceId === 'string'
      && data.selectedSourceId.length > 0
        ? data.selectedSourceId
        : null,
    sourceSortOrder: isSourceListSortOrder(data.sourceSortOrder)
      ? data.sourceSortOrder
      : defaults.sourceSortOrder,
    hideImportedSources:
      typeof data.hideImportedSources === 'boolean'
        ? data.hideImportedSources
        : defaults.hideImportedSources,
    hideProjectedSources:
      typeof data.hideProjectedSources === 'boolean'
        ? data.hideProjectedSources
        : defaults.hideProjectedSources,
    importDryRun:
      typeof data.importDryRun === 'boolean'
        ? data.importDryRun
        : defaults.importDryRun,
    importForce:
      typeof data.importForce === 'boolean'
        ? data.importForce
        : defaults.importForce,
    projectSourceTag: parsePersistedSourceTag(data.projectSourceTag),
    projectDryRun:
      typeof data.projectDryRun === 'boolean'
        ? data.projectDryRun
        : defaults.projectDryRun,
    projectForce:
      typeof data.projectForce === 'boolean'
        ? data.projectForce
        : defaults.projectForce,
  };
}

/** Persisted page state loaded from localStorage without blocking page startup on malformed data. */
function readImportPageState(): HsdataImportPageState {
  const defaults = createDefaultImportPageState();

  if (typeof window === 'undefined') {
    return defaults;
  }

  const raw = window.localStorage.getItem(IMPORT_PAGE_STATE_KEY);
  if (!raw) {
    return defaults;
  }

  try {
    return normalizeImportPageState(JSON.parse(raw));
  } catch (error) {
    console.warn('Failed to parse hsdata import page state:', error);
    window.localStorage.removeItem(IMPORT_PAGE_STATE_KEY);
    return defaults;
  }
}

/** Current page options written to localStorage after the initial restore has finished. */
function persistImportPageState() {
  if (!hasRestoredImportPageState.value || typeof window === 'undefined') {
    return;
  }

  const selectedSourceId = importForm.id.length > 0 ? importForm.id : null;
  restoredSelectedSourceId.value = selectedSourceId;

  const payload: HsdataImportPageState = {
    version:              1,
    selectedSourceId,
    sourceSortOrder:      sourceSortOrder.value,
    hideImportedSources:  hideImportedSources.value,
    hideProjectedSources: hideProjectedSources.value,
    importDryRun:         importForm.dryRun,
    importForce:          importForm.force,
    projectSourceTag:     projectForm.sourceTag,
    projectDryRun:        projectForm.dryRun,
    projectForce:         projectForm.force,
  };

  try {
    window.localStorage.setItem(IMPORT_PAGE_STATE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Failed to persist hsdata import page state:', error);
  }
}

/** Page options restored before async data loading so reload can reuse them safely. */
function restoreImportPageState() {
  const state = readImportPageState();

  sourceSortOrder.value = state.sourceSortOrder;
  hideImportedSources.value = state.hideImportedSources;
  hideProjectedSources.value = state.hideProjectedSources;
  importForm.dryRun = state.importDryRun;
  importForm.force = state.importForce;
  projectForm.sourceTag = state.projectSourceTag;
  projectForm.dryRun = state.projectDryRun;
  projectForm.force = state.projectForce;
  restoredSelectedSourceId.value = state.selectedSourceId;
}

/** Source id explicitly requested by the current route query. */
function getRouteSelectedSourceId(): string | null {
  const selectedId
    = typeof route.query.source === 'string' ? route.query.source : null;

  return selectedId && selectedId.length > 0 ? selectedId : null;
}

/** Selection id restored with route query precedence over local page state. */
function resolvePreferredSelectionId(): string | null {
  return (
    getRouteSelectedSourceId()
    ?? (importForm.id.length > 0 ? importForm.id : null)
    ?? restoredSelectedSourceId.value
  );
}

/** Source list row tone derived from high-level import and projection stages. */
function getSourceListItemClass(
  status: HsdataSourceVersionStatus | null,
  hasSourceTag: boolean,
  isLoading: boolean,
  hasError: boolean,
): string {
  if (!hasSourceTag) {
    return 'border-default bg-default hover:bg-elevated';
  }

  if (isLoading && status == null) {
    return 'border-default bg-default hover:bg-elevated';
  }

  if (hasError && status == null) {
    return 'border-default bg-default hover:bg-elevated';
  }

  if (status == null || status.importStatus !== 'completed') {
    return 'border-default bg-default hover:bg-elevated';
  }

  if (status.projectionStatus === 'completed') {
    return 'border-success/40 bg-success/5 hover:bg-success/10';
  }

  return 'border-warning/40 bg-warning/5 hover:bg-warning/10';
}

/** Import badge rendered for one sourceTag status. */
function getImportStatusBadge(
  status: HsdataSourceVersionStatus | null,
  hasSourceTag: boolean,
  isLoading: boolean,
  hasError: boolean,
): SourceStatusBadge {
  if (!hasSourceTag) {
    return { label: '待解析 sourceTag', color: 'neutral', variant: 'outline' };
  }

  if (isLoading && status == null) {
    return { label: '导入状态加载中', color: 'neutral', variant: 'outline' };
  }

  if (hasError && status == null) {
    return { label: '导入状态不可用', color: 'warning', variant: 'outline' };
  }

  if (status == null) {
    return { label: '未导入', color: 'neutral', variant: 'outline' };
  }

  switch (status.importStatus) {
  case 'pending':
    return { label: '待导入', color: 'neutral', variant: 'soft' };
  case 'processing':
    return { label: '导入中', color: 'primary', variant: 'soft' };
  case 'completed':
    return { label: '已导入', color: 'success', variant: 'soft' };
  case 'failed':
    return { label: '导入失败', color: 'error', variant: 'soft' };
  }

  return { label: '导入状态不可用', color: 'warning', variant: 'outline' };
}

/** Projection badge rendered for one sourceTag status. */
function getProjectionStatusBadge(
  status: HsdataSourceVersionStatus | null,
  hasSourceTag: boolean,
  isLoading: boolean,
  hasError: boolean,
): SourceStatusBadge {
  if (!hasSourceTag) {
    return { label: '待解析 sourceTag', color: 'neutral', variant: 'outline' };
  }

  if (isLoading && status == null) {
    return { label: '投影状态加载中', color: 'neutral', variant: 'outline' };
  }

  if (hasError && status == null) {
    return { label: '投影状态不可用', color: 'warning', variant: 'outline' };
  }

  if (status == null) {
    return { label: '未投影', color: 'neutral', variant: 'outline' };
  }

  switch (status.projectionStatus) {
  case 'not_started':
    return { label: '未投影', color: 'neutral', variant: 'outline' };
  case 'processing':
    return { label: '投影中', color: 'primary', variant: 'soft' };
  case 'completed':
    return { label: '已投影', color: 'success', variant: 'soft' };
  case 'failed':
    return { label: '投影失败', color: 'error', variant: 'soft' };
  }

  return { label: '投影状态不可用', color: 'warning', variant: 'outline' };
}

/** Selected source status summary text shown below the detail badges. */
function describeSelectedSourceStatus(
  status: HsdataSourceVersionStatus | null,
  sourceTag: number | null,
  isLoading: boolean,
  hasError: boolean,
): string {
  if (sourceTag == null) {
    return '当前来源还没有可用的 sourceTag，暂时无法匹配数据库状态。';
  }

  if (isLoading && status == null) {
    return '正在加载这个 sourceTag 的导入与投影状态。';
  }

  if (hasError && status == null) {
    return '这个 sourceTag 的状态暂时不可用，请先排查上方状态接口错误。';
  }

  if (status == null) {
    return '数据库中还没有这个 sourceTag 的导入记录。';
  }

  if (status.importStatus !== 'completed') {
    return '这个 sourceTag 还没有完成导入，暂时不能执行正式投影。';
  }

  if (status.projectionStatus === 'failed') {
    return '这个 sourceTag 已完成导入，但最近一次投影失败，可以在修正问题后重试。';
  }

  if (status.projectionStatus === 'processing') {
    return '这个 sourceTag 正在投影中，请等待状态完成后再决定是否重试。';
  }

  if (status.projectionStatus === 'completed') {
    return '这个 sourceTag 已完成导入和投影，可以直接复查投影结果。';
  }

  return '这个 sourceTag 已完成导入，下一步可以执行投影。';
}

/** Projection condition text for the manual project panel. */
function describeProjectCondition(
  status: HsdataSourceVersionStatus | null,
  sourceTag: number | null,
  isLoading: boolean,
  hasError: boolean,
): string {
  if (sourceTag == null) {
    return '请输入一个 sourceTag，系统会根据 source_versions 判断是否可投影。';
  }

  if (isLoading && status == null) {
    return '正在加载 sourceTag 状态。';
  }

  if (hasError && status == null) {
    return '当前无法读取 source_versions 状态，请先排查状态接口错误。';
  }

  if (status == null) {
    return '数据库中还没有这个 sourceTag 的导入记录。';
  }

  if (status.importStatus !== 'completed') {
    return '只有 `source_versions.status = completed` 的 sourceTag 才能执行投影。';
  }

  if (status.projectionStatus === 'failed') {
    return '这个 sourceTag 已完成导入，但最近一次投影失败，可以直接重试。';
  }

  if (status.projectionStatus === 'processing') {
    return '这个 sourceTag 当前正在投影中。';
  }

  if (status.projectionStatus === 'completed') {
    return '这个 sourceTag 已完成投影，若需要强制重跑可开启 Force。';
  }

  return '这个 sourceTag 已完成导入，可以开始投影。';
}

/** Selected source details copied into the import form and mirrored to the project form. */
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

/** Route-driven source selection applied when the query explicitly names one source. */
function applyRouteSelection() {
  const selectedId = getRouteSelectedSourceId();
  if (!selectedId) {
    return;
  }

  restoreSelection(selectedId);
}

/** Selection restored from a preferred source id and cleared carefully when that source disappears. */
function restoreSelection(selectedId: string | null) {
  if (!selectedId) {
    return;
  }

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
}

/** Import panel reset that clears transient source data but preserves page-level execution preferences. */
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
}

/** Project panel reset that clears transient result state without discarding stored execution preferences. */
function resetProjectForm() {
  projectError.value = '';
  projectResult.value = null;
  projectForm.sourceTag = importForm.sourceTag;
}

/** Project sourceTag aligned with the currently selected import source. */
function useSelectedSourceTag() {
  projectForm.sourceTag = importForm.sourceTag;
}

/** Source list sort direction toggled between descending and ascending sourceTag order. */
function toggleSourceSortOrder() {
  sourceSortOrder.value = sourceSortOrder.value === 'desc' ? 'asc' : 'desc';
}

/** Repo configuration state loaded before any source list calls are attempted. */
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

/** Local hsdata source files loaded from the configured desktop repository. */
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

/** Persisted sourceTag statuses loaded from the console API. */
async function loadSourceVersions() {
  loadingSourceVersions.value = true;
  sourceVersionError.value = '';

  try {
    sourceVersions.value
      = await orpc.hearthstone.dataSource.hsdata.listSourceVersions();
  } catch (error) {
    console.error('Failed to load hsdata source versions:', error);
    sourceVersionError.value = getHsdataErrorMessage(error);
    sourceVersions.value = [];
  } finally {
    loadingSourceVersions.value = false;
  }
}

/** Source list and sourceTag statuses refreshed together. */
async function reloadSourceList() {
  await Promise.all([loadFiles(), loadSourceVersions()]);
  restoreSelection(resolvePreferredSelectionId());
}

/** Full page data reload that reapplies the preferred selection after async loading completes. */
async function reloadAll(selectedId: string | null = resolvePreferredSelectionId()) {
  await Promise.all([loadState(), loadSourceVersions()]);
  await loadFiles();
  restoreSelection(selectedId);
}

/** Remote tag sync followed by a local list refresh that keeps the current source selection when possible. */
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

/** Desktop import flow started for the selected local hsdata source. */
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

    const file = files.value.find(item => item.id === importForm.id);
    if (file) {
      file.sourceTag = result.sourceTag;
    }

    importForm.sourceTag = result.sourceTag;
    importResult.value = result;
    projectForm.sourceTag = result.sourceTag;
  } catch (error) {
    console.error('Failed to import hsdata source:', error);
    importError.value = getHsdataErrorMessage(error);
  } finally {
    importing.value = false;
    await loadSourceVersions();
  }
}

/** Source version projection requested for the selected or manually entered sourceTag. */
async function submitProject() {
  if (!canProject.value || projectForm.sourceTag == null) {
    return;
  }

  projecting.value = true;
  projectError.value = '';
  projectResult.value = null;

  try {
    projectResult.value
      = await orpc.hearthstone.dataSource.hsdata.projectSourceVersion({
        sourceTag: projectForm.sourceTag,
        dryRun:    projectForm.dryRun,
        force:     projectForm.force,
      });
  } catch (error) {
    console.error('Failed to project hsdata source version:', error);
    projectError.value = getHsdataErrorMessage(error);
  } finally {
    projecting.value = false;
    await loadSourceVersions();
  }
}

watch(
  () => route.query.source,
  () => {
    applyRouteSelection();
  },
);

watch(
  [
    sourceSortOrder,
    hideImportedSources,
    hideProjectedSources,
    () => importForm.id,
    () => importForm.dryRun,
    () => importForm.force,
    () => projectForm.sourceTag,
    () => projectForm.dryRun,
    () => projectForm.force,
  ],
  () => {
    persistImportPageState();
  },
);

onMounted(async () => {
  restoreImportPageState();

  stopHsdataImportProgressListener = await listenHsdataImportProgress(
    progress => {
      if (
        progress.sourceId !== activeImportSourceId.value
        && progress.sourceId !== importForm.id
        && progress.sourceId !== importProgress.value?.sourceId
      ) {
        return;
      }

      importProgress.value = progress;
    },
  );

  await reloadAll(resolvePreferredSelectionId());
  hasRestoredImportPageState.value = true;
  persistImportPageState();
});

onBeforeUnmount(() => {
  stopHsdataImportProgressListener?.();
  stopHsdataImportProgressListener = null;
});
</script>
