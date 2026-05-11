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
              batchRunning ||
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

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-medium">批量操作</div>
            <p class="mt-1 text-xs text-muted">
              按当前筛选结果和排序顺序串行执行，中断后可继续剩余项。
            </p>
          </div>
          <UBadge
            :label="batchStatusBadge.label"
            :color="batchStatusBadge.color"
            variant="soft"
          />
        </div>
      </template>

      <div class="space-y-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">批量导入候选</div>
            <div class="mt-1 font-mono text-sm">
              {{ batchImportCandidateItems.length }}
            </div>
            <div class="mt-1 text-xs text-muted">
              使用当前导入参数和列表筛选条件
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">批量投影候选</div>
            <div class="mt-1 font-mono text-sm">
              {{ batchProjectCandidateItems.length }}
            </div>
            <div class="mt-1 text-xs text-muted">
              使用当前投影参数和列表筛选条件
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">任务进度</div>
            <div class="mt-1 font-mono text-sm">
              {{ batchProgressText }}
            </div>
            <div class="mt-1 text-xs text-muted">
              {{ batchStatusText }}
            </div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">当前项</div>
            <div class="mt-1 break-all font-mono text-sm">
              {{ batchCurrentItemLabel }}
            </div>
            <div class="mt-1 text-xs text-muted">
              {{ batchCurrentItemHint }}
            </div>
          </div>
        </div>

        <UAlert
          v-if="batchFailedItem?.note"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="batchFailedItem.label"
          :description="batchFailedItem.note"
        />
        <UAlert
          v-else-if="batchRequestedAction === 'pause'"
          color="warning"
          variant="soft"
          icon="i-lucide-pause-circle"
          title="暂停请求已提交"
          description="当前项完成后会暂停，并保留剩余队列。"
        />
        <UAlert
          v-else-if="batchRequestedAction === 'clear'"
          color="error"
          variant="soft"
          icon="i-lucide-octagon-minus"
          title="停止请求已提交"
          description="当前项完成后会停止，并清空本轮批量状态。"
        />

        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            v-if="canPauseBatchTask"
            label="暂停"
            icon="i-lucide-pause"
            color="warning"
            variant="soft"
            @click="requestBatchTaskAction('pause')"
          />
          <UButton
            v-if="canStopBatchTask"
            label="停止并清除"
            icon="i-lucide-square"
            color="error"
            variant="soft"
            @click="requestBatchTaskAction('clear')"
          />
          <UButton
            v-if="canResumeBatchTask"
            label="继续未完成任务"
            icon="i-lucide-play"
            color="warning"
            variant="soft"
            @click="resumeBatchTask"
          />
          <UButton
            v-if="batchTask"
            label="清除批量任务状态"
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            :disabled="batchRunning"
            @click="clearBatchTask"
          />
          <UButton
            label="批量导入当前筛选结果"
            icon="i-lucide-arrow-down-to-line"
            color="primary"
            variant="soft"
            :disabled="!canStartBatchImport"
            :loading="batchRunning && batchTask?.kind === 'import'"
            @click="startBatchImport"
          />
          <UButton
            label="批量投影当前筛选结果"
            icon="i-lucide-waypoints"
            color="neutral"
            variant="soft"
            :disabled="!canStartBatchProject"
            :loading="batchRunning && batchTask?.kind === 'project'"
            @click="startBatchProject"
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
                :disabled="batchRunning"
                @click="resetImportForm"
              />
              <UButton
                label="执行导入"
                icon="i-lucide-play"
                :loading="importing"
                :disabled="!canImport || batchRunning"
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
                :disabled="batchRunning"
                @click="resetProjectForm"
              />
              <UButton
                label="执行投影"
                icon="i-lucide-waypoints"
                :loading="projecting"
                :disabled="!canProject || batchRunning"
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
                :disabled="!state?.repoPath || batchRunning"
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
                :disabled="batchRunning"
                @click="toggleSourceSortOrder"
              />

              <label
                class="flex items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-xs"
              >
                <input
                  v-model="hideImportedSources"
                  type="checkbox"
                  class="size-3.5 rounded border-default"
                  :disabled="batchRunning"
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
                  :disabled="batchRunning"
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

/** Batch task kinds supported by the hsdata import page. */
type HsdataBatchTaskKind = 'import' | 'project';

/** Durable batch task states restored after route switches or app restarts. */
type HsdataBatchTaskStatus = 'running' | 'paused' | 'failed' | 'completed';

/** Cooperative control requests applied after the current batch item settles. */
type HsdataBatchTaskRequestedAction = 'pause' | 'clear';

/** Per-item execution outcomes tracked inside one durable batch task. */
type HsdataBatchTaskItemStatus = 'pending' | 'completed' | 'skipped' | 'failed';

/** Next action chosen for one batch item after checking the latest durable state. */
type HsdataBatchTaskDecision
  = | { action: 'run'; file?: HsdataFile | null }
    | { action: 'skip'; note: string }
    | { action: 'blocked'; note: string };

/** One batch status badge rendered in the batch operation card. */
interface HsdataBatchStatusBadge {
  label: string;
  color: 'neutral' | 'primary' | 'success' | 'warning' | 'error';
}

/** One source or sourceTag item scheduled inside a durable batch task snapshot. */
interface HsdataBatchTaskItem {
  key:      string;
  sourceId: string | null;
  sourceTag: number | null;
  label:    string;
  status:   HsdataBatchTaskItemStatus;
  note:     string | null;
}

/** Persisted batch controller state restored independently from the page option state. */
interface HsdataBatchTaskState {
  version:     1;
  executionId: string | null;
  kind:        HsdataBatchTaskKind;
  status:      HsdataBatchTaskStatus;
  requestedAction: HsdataBatchTaskRequestedAction | null;
  order:       SourceListSortOrder;
  dryRun:      boolean;
  force:       boolean;
  items:       HsdataBatchTaskItem[];
  activeKey:   string | null;
  startedAt:   string;
  updatedAt:   string;
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

declare global {
  /** Shared runtime marker used to avoid starting a duplicate batch loop in the same desktop window. */
  interface Window {
    __hsdataBatchRuntime?: {
      executionId: string;
    };
  }
}

definePageMeta({
  layout: 'admin',
  title:  '数据导入',
});

const IMPORT_PAGE_STATE_KEY = 'console-desktop-hearthstone-hsdata-import-page';
const HSDATA_BATCH_TASK_STATE_KEY = 'console-desktop-hearthstone-hsdata-batch-task';

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
const batchTask = ref<HsdataBatchTaskState | null>(null);
const restoredSelectedSourceId = ref<string | null>(null);
const hasRestoredImportPageState = ref(false);
const currentBatchExecutionId = ref<string | null>(null);
let batchStatePollTimer: ReturnType<typeof setInterval> | null = null;
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
const batchImportCandidateItems = computed<HsdataBatchTaskItem[]>(() => {
  return visibleSourceListItems.value
    .filter(item => isBatchImportCandidate(item.status, importForm.force))
    .map(item => buildBatchImportTaskItem(item.file));
});
const batchProjectCandidateItems = computed<HsdataBatchTaskItem[]>(() => {
  return visibleSourceListItems.value
    .filter(item => isBatchProjectCandidate(item.status, item.file.sourceTag, projectForm.force))
    .map(item => buildBatchProjectTaskItem(item.file));
});
const batchRunning = computed(() => batchTask.value?.status === 'running');
const batchOwnsRunningExecution = computed(() => {
  const task = batchTask.value;

  return Boolean(
    task
    && task.status === 'running'
    && task.executionId != null
    && task.executionId === currentBatchExecutionId.value,
  );
});
const batchRequestedAction = computed(() => batchTask.value?.requestedAction ?? null);
const batchCurrentItem = computed(() => {
  const task = batchTask.value;

  if (!task || task.activeKey == null) {
    return null;
  }

  return task.items.find(item => item.key === task.activeKey) ?? null;
});
const batchProcessedCount = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return 0;
  }

  return task.items.filter(item => item.status !== 'pending').length;
});
const batchRemainingCount = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return 0;
  }

  return task.items.filter(item => item.status === 'pending').length;
});
const batchCompletedCount = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return 0;
  }

  return task.items.filter(item => item.status === 'completed').length;
});
const batchSkippedCount = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return 0;
  }

  return task.items.filter(item => item.status === 'skipped').length;
});
const batchFailedCount = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return 0;
  }

  return task.items.filter(item => item.status === 'failed').length;
});
const batchFailedItem = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return null;
  }

  return task.items.find(item => item.status === 'failed') ?? null;
});
const batchStatusBadge = computed<HsdataBatchStatusBadge>(() => {
  const task = batchTask.value;

  if (!task) {
    return { label: '无任务', color: 'neutral' };
  }

  if (task.status === 'running' && task.requestedAction === 'pause') {
    return { label: '暂停请求中', color: 'warning' };
  }

  if (task.status === 'running' && task.requestedAction === 'clear') {
    return { label: '停止请求中', color: 'error' };
  }

  switch (task.status) {
  case 'running':
    return {
      label: task.kind === 'import' ? '批量导入中' : '批量投影中',
      color: 'primary',
    };
  case 'paused':
    return { label: '已暂停', color: 'warning' };
  case 'failed':
    return { label: '已失败', color: 'error' };
  case 'completed':
    return { label: '已完成', color: 'success' };
  }
});
const batchProgressText = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return '-';
  }

  return `${batchProcessedCount.value} / ${task.items.length}`;
});
const batchStatusText = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return '尚未开始批量任务。';
  }

  const kindLabel = task.kind === 'import' ? '批量导入' : '批量投影';
  const runtimeLabel = task.dryRun ? 'Dry run' : 'Write mode';
  const requestedActionLabel = task.requestedAction === 'pause'
    ? ' · 当前项结束后暂停'
    : task.requestedAction === 'clear'
      ? ' · 当前项结束后停止并清除'
      : '';
  return `${kindLabel} · ${runtimeLabel} · 完成 ${batchCompletedCount.value} · 跳过 ${batchSkippedCount.value} · 剩余 ${batchRemainingCount.value}${requestedActionLabel}`;
});
const batchCurrentItemLabel = computed(() => {
  return batchCurrentItem.value?.label ?? '-';
});
const batchCurrentItemHint = computed(() => {
  const task = batchTask.value;

  if (!task) {
    return '启动后会按当前筛选结果生成一次顺序快照。';
  }

  if (task.status === 'running') {
    if (task.requestedAction === 'pause') {
      return '暂停已提交，当前项完成后会保留剩余队列。';
    }

    if (task.requestedAction === 'clear') {
      return '停止已提交，当前项完成后会清空本轮批量状态。';
    }

    return '当前项完成后才会进入下一项。';
  }

  if (task.status === 'failed') {
    return '失败项会保留在队列中，修正问题后可继续未完成任务。';
  }

  if (task.status === 'completed') {
    return '可以直接启动新一轮批量任务。';
  }

  return '可继续未完成任务，或清除状态后重新生成队列。';
});
const hasBlockingBatchTask = computed(() => {
  const task = batchTask.value;

  return task != null && task.status !== 'completed';
});
const canResumeBatchTask = computed(() => {
  const task = batchTask.value;

  return Boolean(
    task
    && task.status !== 'completed'
    && task.status !== 'running'
    && batchRemainingCount.value > 0
    && !loadingState.value
    && !loadingFiles.value
    && !loadingSourceVersions.value
    && !syncing.value
    && !importing.value
    && !projecting.value,
  );
});
const canPauseBatchTask = computed(() => {
  return batchOwnsRunningExecution.value && batchRequestedAction.value == null;
});
const canStopBatchTask = computed(() => {
  return batchOwnsRunningExecution.value && batchRequestedAction.value !== 'clear';
});

const canImport = computed(
  () =>
    Boolean(state.value?.repoPath)
    && importForm.id.trim().length > 0
    && !importing.value,
);
const canProject = computed(
  () => projectForm.sourceTag != null && !projecting.value,
);
const canStartBatchImport = computed(() => {
  return Boolean(state.value?.repoPath)
    && batchImportCandidateItems.value.length > 0
    && !hasBlockingBatchTask.value
    && !loadingState.value
    && !loadingFiles.value
    && !loadingSourceVersions.value
    && !syncing.value
    && !importing.value
    && !projecting.value;
});
const canStartBatchProject = computed(() => {
  return Boolean(state.value?.repoPath)
    && batchProjectCandidateItems.value.length > 0
    && !hasBlockingBatchTask.value
    && !loadingState.value
    && !loadingFiles.value
    && !loadingSourceVersions.value
    && !syncing.value
    && !importing.value
    && !projecting.value;
});
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

/** Whether the provided value matches one supported batch task kind. */
function isHsdataBatchTaskKind(value: unknown): value is HsdataBatchTaskKind {
  return value === 'import' || value === 'project';
}

/** Whether the provided value matches one durable batch task status. */
function isHsdataBatchTaskStatus(value: unknown): value is HsdataBatchTaskStatus {
  return value === 'running'
    || value === 'paused'
    || value === 'failed'
    || value === 'completed';
}

/** Whether the provided value matches one cooperative batch control request. */
function isHsdataBatchTaskRequestedAction(
  value: unknown,
): value is HsdataBatchTaskRequestedAction {
  return value === 'pause' || value === 'clear';
}

/** Whether the provided value matches one per-item batch outcome status. */
function isHsdataBatchTaskItemStatus(value: unknown): value is HsdataBatchTaskItemStatus {
  return value === 'pending'
    || value === 'completed'
    || value === 'skipped'
    || value === 'failed';
}

/** Shared execution id generated for one in-memory batch runner instance. */
function createBatchExecutionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Active in-memory batch execution id shared across route instances in the same desktop window. */
function getBatchRuntimeExecutionId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.__hsdataBatchRuntime?.executionId ?? null;
}

/** Shared runtime marker written when the current page instance owns the batch loop. */
function setBatchRuntimeExecutionId(executionId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.__hsdataBatchRuntime = { executionId };
}

/** Shared runtime marker cleared only by the page instance that owns the batch loop. */
function clearBatchRuntimeExecutionId(executionId: string | null) {
  if (
    typeof window === 'undefined'
    || executionId == null
    || window.__hsdataBatchRuntime?.executionId !== executionId
  ) {
    return;
  }

  delete window.__hsdataBatchRuntime;
}

/** One batch task item sanitized from localStorage. */
function normalizeBatchTaskItem(value: unknown): HsdataBatchTaskItem | null {
  if (typeof value !== 'object' || value == null) {
    return null;
  }

  const data = value as Record<string, unknown>;
  const key = typeof data.key === 'string' && data.key.length > 0
    ? data.key
    : null;
  const label = typeof data.label === 'string' && data.label.length > 0
    ? data.label
    : null;
  const sourceId = typeof data.sourceId === 'string' && data.sourceId.length > 0
    ? data.sourceId
    : null;
  const sourceTag = parsePersistedSourceTag(data.sourceTag);

  if (key == null || label == null || !isHsdataBatchTaskItemStatus(data.status)) {
    return null;
  }

  return {
    key,
    sourceId,
    sourceTag,
    label,
    status: data.status,
    note: typeof data.note === 'string' && data.note.length > 0 ? data.note : null,
  };
}

/** Durable batch controller state sanitized from localStorage. */
function normalizeBatchTaskState(value: unknown): HsdataBatchTaskState | null {
  if (typeof value !== 'object' || value == null) {
    return null;
  }

  const data = value as Record<string, unknown>;

  if (
    data.version !== 1
    || !isHsdataBatchTaskKind(data.kind)
    || !isHsdataBatchTaskStatus(data.status)
    || !isSourceListSortOrder(data.order)
    || typeof data.dryRun !== 'boolean'
    || typeof data.force !== 'boolean'
    || !Array.isArray(data.items)
  ) {
    return null;
  }

  const items = data.items
    .map(item => normalizeBatchTaskItem(item))
    .filter((item): item is HsdataBatchTaskItem => item != null);

  const startedAt = typeof data.startedAt === 'string' && data.startedAt.length > 0
    ? data.startedAt
    : new Date().toISOString();
  const updatedAt = typeof data.updatedAt === 'string' && data.updatedAt.length > 0
    ? data.updatedAt
    : startedAt;
  const executionId = typeof data.executionId === 'string' && data.executionId.length > 0
    ? data.executionId
    : null;
  const activeKey = typeof data.activeKey === 'string' && data.activeKey.length > 0
    ? data.activeKey
    : null;
  const requestedAction = isHsdataBatchTaskRequestedAction(data.requestedAction)
    ? data.requestedAction
    : null;

  return {
    version: 1,
    executionId,
    kind: data.kind,
    status: data.status,
    requestedAction,
    order: data.order,
    dryRun: data.dryRun,
    force: data.force,
    items,
    activeKey,
    startedAt,
    updatedAt,
  };
}

/** Durable batch task loaded from localStorage with stale running states downgraded to paused. */
function readBatchTaskState(): HsdataBatchTaskState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(HSDATA_BATCH_TASK_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const normalized = normalizeBatchTaskState(JSON.parse(raw));

    if (!normalized) {
      window.localStorage.removeItem(HSDATA_BATCH_TASK_STATE_KEY);
      return null;
    }

    // `running` is only trustworthy while the same desktop window still owns the in-memory loop.
    // After a restart there is no runtime marker, so the durable task must resume from `paused`.
    if (
      normalized.status === 'running'
      && normalized.executionId != null
      && getBatchRuntimeExecutionId() !== normalized.executionId
    ) {
      normalized.status = 'paused';
      normalized.executionId = null;
      normalized.requestedAction = null;
      normalized.activeKey = nextBatchTaskItem(normalized)?.key ?? normalized.activeKey;
    }

    return normalized;
  } catch (error) {
    console.warn('Failed to parse hsdata batch task state:', error);
    window.localStorage.removeItem(HSDATA_BATCH_TASK_STATE_KEY);
    return null;
  }
}

/** Durable batch task written to localStorage whenever the controller state changes. */
function persistBatchTaskState() {
  if (typeof window === 'undefined') {
    return;
  }

  if (!batchTask.value) {
    window.localStorage.removeItem(HSDATA_BATCH_TASK_STATE_KEY);
    return;
  }

  batchTask.value.updatedAt = new Date().toISOString();

  try {
    window.localStorage.setItem(
      HSDATA_BATCH_TASK_STATE_KEY,
      JSON.stringify(batchTask.value),
    );
  } catch (error) {
    console.warn('Failed to persist hsdata batch task state:', error);
  }
}

/** Durable batch task restored from localStorage when the page is mounted. */
function restoreBatchTaskState() {
  batchTask.value = readBatchTaskState();
  persistBatchTaskState();
}

/** Durable batch task cleared from memory and localStorage after the user discards it. */
function clearBatchTaskState() {
  clearBatchRuntimeExecutionId(currentBatchExecutionId.value);
  currentBatchExecutionId.value = null;
  batchTask.value = null;
  persistBatchTaskState();
}

/** Local polling enabled only when another route instance owns the active batch loop. */
function shouldPollBatchTaskState() {
  const task = batchTask.value;

  return Boolean(
    task
    && task.status === 'running'
    && task.executionId != null
    && task.executionId === getBatchRuntimeExecutionId()
    && task.executionId !== currentBatchExecutionId.value,
  );
}

/** Durable batch task reloaded periodically while another route instance owns the active loop. */
function syncBatchTaskStateFromStorage() {
  if (!shouldPollBatchTaskState()) {
    return;
  }

  batchTask.value = readBatchTaskState();
}

/** Local polling refreshed whenever the visible durable batch ownership changes. */
function refreshBatchTaskPolling() {
  if (batchStatePollTimer != null) {
    clearInterval(batchStatePollTimer);
    batchStatePollTimer = null;
  }

  if (!shouldPollBatchTaskState()) {
    return;
  }

  batchStatePollTimer = window.setInterval(() => {
    syncBatchTaskStateFromStorage();
  }, 1000);
}

/** User-facing batch item label derived from one visible source list row. */
function buildBatchItemLabel(file: HsdataFile) {
  return file.sourceTag != null
    ? `${file.sourceTag} · ${file.name}`
    : file.name;
}

/** One import batch task item built from a visible source row. */
function buildBatchImportTaskItem(file: HsdataFile): HsdataBatchTaskItem {
  return {
    key:      `source:${file.id}`,
    sourceId: file.id,
    sourceTag: file.sourceTag ?? null,
    label:    buildBatchItemLabel(file),
    status:   'pending',
    note:     null,
  };
}

/** One projection batch task item built from a visible source row. */
function buildBatchProjectTaskItem(file: HsdataFile): HsdataBatchTaskItem {
  return {
    key:      `tag:${file.sourceTag}`,
    sourceId: file.id,
    sourceTag: file.sourceTag ?? null,
    label:    buildBatchItemLabel(file),
    status:   'pending',
    note:     null,
  };
}

/** Whether one source row should be included when building a new import batch snapshot. */
function isBatchImportCandidate(
  status: HsdataSourceVersionStatus | null,
  force: boolean,
) {
  if (status?.importStatus === 'processing') {
    return false;
  }

  if (status == null) {
    return true;
  }

  if (force) {
    return status.importStatus !== 'processing';
  }

  return status.importStatus !== 'completed';
}

/** Whether one source row should be included when building a new projection batch snapshot. */
function isBatchProjectCandidate(
  status: HsdataSourceVersionStatus | null,
  sourceTag: number | undefined,
  force: boolean,
) {
  if (sourceTag == null || status == null || status.importStatus !== 'completed') {
    return false;
  }

  if (status.projectionStatus === 'processing') {
    return false;
  }

  if (force) {
    return true;
  }

  return status.projectionStatus !== 'completed';
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

/** One durable batch task created from the current visible candidate snapshot. */
function createBatchTask(
  kind: HsdataBatchTaskKind,
  items: HsdataBatchTaskItem[],
  dryRun: boolean,
  force: boolean,
): HsdataBatchTaskState {
  const now = new Date().toISOString();

  return {
    version: 1,
    executionId: null,
    kind,
    status: 'paused',
    requestedAction: null,
    order: sourceSortOrder.value,
    dryRun,
    force,
    items,
    activeKey: null,
    startedAt: now,
    updatedAt: now,
  };
}

/** Next unresolved batch item selected from the durable task snapshot. */
function nextBatchTaskItem(task: HsdataBatchTaskState) {
  return task.items.find(item => item.status === 'pending' || item.status === 'failed') ?? null;
}

/** One local source row resolved by its stable desktop source id. */
function findSourceById(sourceId: string) {
  return files.value.find(item => item.id === sourceId) ?? null;
}

/** One local source row resolved by its current sourceTag when available. */
function findSourceByTag(sourceTag: number) {
  return files.value.find(item => item.sourceTag === sourceTag) ?? null;
}

/** Single-source import executed with explicit parameters so the batch runner can reuse it safely. */
async function runImportForSource(
  sourceId: string,
  dryRun: boolean,
  force: boolean,
): Promise<HsdataImportReport> {
  const file = findSourceById(sourceId);
  if (file) {
    selectSource(file);
  }

  importing.value = true;
  activeImportSourceId.value = sourceId;
  importError.value = '';
  importProgress.value = null;
  importResult.value = null;

  try {
    const result = await importHsdataSource(sourceId, dryRun, force);
    const nextFile = findSourceById(sourceId);

    if (nextFile) {
      nextFile.sourceTag = result.sourceTag;
    }

    if (importForm.id === sourceId) {
      importForm.sourceTag = result.sourceTag;
      projectForm.sourceTag = result.sourceTag;
    }

    importResult.value = result;
    return result;
  } catch (error) {
    console.error('Failed to import hsdata source:', error);
    importError.value = getHsdataErrorMessage(error);
    throw error;
  } finally {
    importing.value = false;
    await loadSourceVersions();
  }
}

/** Single sourceTag projection executed with explicit parameters so the batch runner can reuse it safely. */
async function runProjectForSourceTag(
  sourceTag: number,
  dryRun: boolean,
  force: boolean,
): Promise<HsdataProjectReport> {
  const file = findSourceByTag(sourceTag);
  if (file) {
    selectSource(file);
  } else {
    projectForm.sourceTag = sourceTag;
  }

  projecting.value = true;
  projectError.value = '';
  projectResult.value = null;

  try {
    const result
      = await orpc.hearthstone.dataSource.hsdata.projectSourceVersion({
        sourceTag,
        dryRun,
        force,
      });
    projectResult.value = result;
    return result;
  } catch (error) {
    console.error('Failed to project hsdata source version:', error);
    projectError.value = getHsdataErrorMessage(error);
    throw error;
  } finally {
    projecting.value = false;
    await loadSourceVersions();
  }
}

/** Latest import decision re-evaluated before each batch step using durable source status. */
function resolveBatchImportDecision(
  task: HsdataBatchTaskState,
  item: HsdataBatchTaskItem,
): HsdataBatchTaskDecision {
  if (!item.sourceId) {
    return { action: 'skip', note: '来源标识缺失，已跳过。' };
  }

  const file = findSourceById(item.sourceId);
  if (!file) {
    return { action: 'skip', note: '来源已不存在，已跳过。' };
  }

  const status = file.sourceTag == null
    ? null
    : (sourceVersionMap.value.get(file.sourceTag) ?? null);

  if (status?.importStatus === 'processing') {
    // Re-running the interrupted current import is safe because the Rust side persists only the
    // remote job manifest and resumes the staged upload/finalize flow idempotently for that tag.
    if (task.activeKey === item.key) {
      return { action: 'run', file };
    }

    return {
      action: 'blocked',
      note: `sourceTag ${file.sourceTag} 正在导入中，请等待该状态完成后再继续批量导入。`,
    };
  }

  if (status?.importStatus === 'completed' && !task.force) {
    return { action: 'skip', note: '该来源已完成导入，恢复时自动跳过。' };
  }

  return { action: 'run', file };
}

/** Latest projection decision re-evaluated before each batch step using durable source status. */
function resolveBatchProjectDecision(
  task: HsdataBatchTaskState,
  item: HsdataBatchTaskItem,
): HsdataBatchTaskDecision {
  if (item.sourceTag == null) {
    return { action: 'skip', note: 'sourceTag 缺失，已跳过。' };
  }

  const status = sourceVersionMap.value.get(item.sourceTag) ?? null;
  if (status == null) {
    return { action: 'skip', note: '数据库中已找不到这个 sourceTag 的导入记录，已跳过。' };
  }

  if (status.importStatus !== 'completed') {
    return {
      action: 'blocked',
      note: `sourceTag ${item.sourceTag} 当前不是 completed，无法继续批量投影。`,
    };
  }

  if (status.projectionStatus === 'processing') {
    return {
      action: 'blocked',
      note: `sourceTag ${item.sourceTag} 正在投影中，请等待该状态完成后再继续批量投影。`,
    };
  }

  if (status.projectionStatus === 'completed' && !task.force) {
    return { action: 'skip', note: '该 sourceTag 已完成投影，恢复时自动跳过。' };
  }

  return { action: 'run' };
}

/** Batch controller state updated after one explicit user discard action. */
function clearBatchTask() {
  clearBatchTaskState();
  refreshBatchTaskPolling();
  toast.add({
    title: '已清除批量任务状态',
    color: 'success',
  });
}

/** Cooperative batch control request persisted so the current item can finish cleanly first. */
function requestBatchTaskAction(
  action: HsdataBatchTaskRequestedAction,
  options?: { silent?: boolean },
) {
  const task = batchTask.value;

  if (
    !task
    || task.status !== 'running'
    || task.executionId == null
    || task.executionId !== currentBatchExecutionId.value
  ) {
    return;
  }

  if (task.requestedAction === action) {
    return;
  }

  task.requestedAction = action;
  batchTask.value = task;
  persistBatchTaskState();
  refreshBatchTaskPolling();

  if (options?.silent) {
    return;
  }

  toast.add({
    title: action === 'pause' ? '已请求暂停批量任务' : '已请求停止批量任务',
    description: action === 'pause'
      ? '当前项完成后会暂停，并保留剩余队列。'
      : '当前项完成后会停止，并清空本轮批量状态。',
    color: action === 'pause' ? 'warning' : 'error',
  });
}

/** Batch item outcome written back into the durable task snapshot. */
function setBatchTaskItemState(
  task: HsdataBatchTaskState,
  item: HsdataBatchTaskItem,
  status: HsdataBatchTaskItemStatus,
  note: string | null,
) {
  item.status = status;
  item.note = note;
  batchTask.value = task;
  persistBatchTaskState();
  refreshBatchTaskPolling();
}

/** Batch controller moved into a paused state after an intentional interruption. */
function pauseBatchTask(task: HsdataBatchTaskState) {
  task.status = 'paused';
  task.executionId = null;
  task.requestedAction = null;
  task.activeKey = nextBatchTaskItem(task)?.key ?? null;
  batchTask.value = task;
  clearBatchRuntimeExecutionId(currentBatchExecutionId.value);
  currentBatchExecutionId.value = null;
  persistBatchTaskState();
  refreshBatchTaskPolling();
}

/** Batch controller moved into a terminal failed state while preserving the failed item for resume. */
function failBatchTask(task: HsdataBatchTaskState) {
  task.status = 'failed';
  task.executionId = null;
  task.requestedAction = null;
  batchTask.value = task;
  clearBatchRuntimeExecutionId(currentBatchExecutionId.value);
  currentBatchExecutionId.value = null;
  persistBatchTaskState();
  refreshBatchTaskPolling();
}

/** Batch controller moved into a terminal completed state after every item has settled. */
function completeBatchTask(task: HsdataBatchTaskState) {
  task.status = 'completed';
  task.executionId = null;
  task.requestedAction = null;
  task.activeKey = null;
  batchTask.value = task;
  clearBatchRuntimeExecutionId(currentBatchExecutionId.value);
  currentBatchExecutionId.value = null;
  persistBatchTaskState();
  refreshBatchTaskPolling();
}

/** Requested batch control action applied only after the current item reaches a stable outcome. */
function applyRequestedBatchTaskAction(task: HsdataBatchTaskState) {
  if (nextBatchTaskItem(task) == null) {
    return false;
  }

  if (task.requestedAction === 'pause') {
    pauseBatchTask(task);
    toast.add({
      title: task.kind === 'import' ? '批量导入已暂停' : '批量投影已暂停',
      description: '剩余队列已保留，可稍后继续未完成任务。',
      color: 'warning',
    });
    return true;
  }

  if (task.requestedAction === 'clear') {
    clearBatchTaskState();
    refreshBatchTaskPolling();
    toast.add({
      title: task.kind === 'import' ? '批量导入已停止' : '批量投影已停止',
      description: '当前项已结束，本轮批量状态已清除。',
      color: 'success',
    });
    return true;
  }

  return false;
}

/** One durable batch task executed strictly one tag at a time until it completes, pauses, or fails. */
async function runBatchTask(task: HsdataBatchTaskState) {
  const executionId = createBatchExecutionId();

  currentBatchExecutionId.value = executionId;
  setBatchRuntimeExecutionId(executionId);

  // `task` may be a plain object created just before the run starts. All later mutations must go
  // through the ref-backed proxy, otherwise Vue will not observe nested status changes.
  batchTask.value = task;
  const currentTask = batchTask.value;
  if (!currentTask) {
    clearBatchRuntimeExecutionId(executionId);
    currentBatchExecutionId.value = null;
    return;
  }

  currentTask.status = 'running';
  currentTask.executionId = executionId;
  currentTask.requestedAction = null;
  currentTask.activeKey = nextBatchTaskItem(currentTask)?.key ?? null;
  persistBatchTaskState();
  refreshBatchTaskPolling();

  try {
    while (true) {
      if (applyRequestedBatchTaskAction(currentTask)) {
        return;
      }

      const item = nextBatchTaskItem(currentTask);
      if (!item) {
        completeBatchTask(currentTask);
        toast.add({
          title: currentTask.kind === 'import' ? '批量导入完成' : '批量投影完成',
          description: `完成 ${batchCompletedCount.value} 项，跳过 ${batchSkippedCount.value} 项。`,
          color: 'success',
        });
        return;
      }

      currentTask.activeKey = item.key;
      if (item.status === 'failed') {
        item.status = 'pending';
        item.note = null;
        persistBatchTaskState();
        refreshBatchTaskPolling();
      }

      const decision = currentTask.kind === 'import'
        ? resolveBatchImportDecision(currentTask, item)
        : resolveBatchProjectDecision(currentTask, item);

      if (decision.action === 'skip') {
        setBatchTaskItemState(currentTask, item, 'skipped', decision.note);
        continue;
      }

      if (decision.action === 'blocked') {
        setBatchTaskItemState(currentTask, item, 'failed', decision.note);
        pauseBatchTask(currentTask);
        toast.add({
          title: currentTask.kind === 'import' ? '批量导入已暂停' : '批量投影已暂停',
          description: decision.note,
          color: 'warning',
        });
        return;
      }

      try {
        const report = currentTask.kind === 'import'
          ? await runImportForSource(item.sourceId!, currentTask.dryRun, currentTask.force)
          : await runProjectForSourceTag(item.sourceTag!, currentTask.dryRun, currentTask.force);

        setBatchTaskItemState(
          currentTask,
          item,
          report.skipped ? 'skipped' : 'completed',
          report.skipped ? '本项按当前参数被跳过。' : null,
        );

        if (applyRequestedBatchTaskAction(currentTask)) {
          return;
        }
      } catch (error) {
        const message = getHsdataErrorMessage(error);
        setBatchTaskItemState(currentTask, item, 'failed', message);
        failBatchTask(currentTask);
        toast.add({
          title: currentTask.kind === 'import' ? '批量导入失败' : '批量投影失败',
          description: message,
          color: 'error',
        });
        return;
      }
    }
  } finally {
    if (
      currentBatchExecutionId.value === executionId
      && batchTask.value?.status === 'running'
      && batchTask.value.executionId === executionId
    ) {
      pauseBatchTask(batchTask.value);
    }
  }
}

/** New import batch started from the current visible import candidates. */
async function startBatchImport() {
  await reloadSourceList();
  const items = batchImportCandidateItems.value.map(item => ({ ...item }));

  if (items.length === 0) {
    return;
  }

  await runBatchTask(createBatchTask('import', items, importForm.dryRun, importForm.force));
}

/** New projection batch started from the current visible projection candidates. */
async function startBatchProject() {
  await reloadSourceList();
  const items = batchProjectCandidateItems.value.map(item => ({ ...item }));

  if (items.length === 0) {
    return;
  }

  await runBatchTask(createBatchTask('project', items, projectForm.dryRun, projectForm.force));
}

/** Durable batch resumed from the remaining unresolved items in the stored task snapshot. */
async function resumeBatchTask() {
  if (!batchTask.value) {
    return;
  }

  await reloadSourceList();
  await runBatchTask(batchTask.value);
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

  await runImportForSource(importForm.id, importForm.dryRun, importForm.force);
}

/** Source version projection requested for the selected or manually entered sourceTag. */
async function submitProject() {
  if (!canProject.value || projectForm.sourceTag == null) {
    return;
  }

  await runProjectForSourceTag(
    projectForm.sourceTag,
    projectForm.dryRun,
    projectForm.force,
  );
}

watch(
  () => route.query.source,
  () => {
    applyRouteSelection();
  },
);

watch(
  [
    () => batchTask.value?.status ?? null,
    () => batchTask.value?.executionId ?? null,
    currentBatchExecutionId,
  ],
  () => {
    refreshBatchTaskPolling();
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
  restoreBatchTaskState();
  refreshBatchTaskPolling();

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
  if (
    batchTask.value?.status === 'running'
    && batchTask.value.executionId != null
    && batchTask.value.executionId === currentBatchExecutionId.value
  ) {
    requestBatchTaskAction('pause', { silent: true });
  }

  if (batchStatePollTimer != null) {
    clearInterval(batchStatePollTimer);
    batchStatePollTimer = null;
  }

  stopHsdataImportProgressListener?.();
  stopHsdataImportProgressListener = null;
});
</script>
