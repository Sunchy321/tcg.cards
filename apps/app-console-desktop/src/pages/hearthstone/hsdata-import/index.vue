<template>
  <div class="desktop-page">
    <div class="space-y-4">
      <UCard>
      <div
        class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"
      >
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-download" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">hsdata 导入、本地投影与远端发布</h1>
          </div>
          <p class="mt-1 text-sm text-muted">选择数据版本后执行本地导入与投影，确认结果后再发布到远端。</p>
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
              hsdataTaskActive ||
              importing ||
              projecting
            "
            @click="syncRemoteVersions"
          />
          <UButton
            :label="syncPatchesLabel"
            icon="i-lucide-tags"
            color="neutral"
            variant="soft"
            :loading="syncingPatches"
            :disabled="syncing || importing || projecting || hsdataTaskActive"
            @click="syncPatches"
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
              to="/settings/games/hearthstone"
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
        <TaskController
          ref="taskController"
          title="hsdata 导入与投影"
          :operations="[]"
          :multi-task="multiTaskItems"
          @completed="handleTaskCompleted"
          @failed="handleTaskFailed"
          @create-error="handleTaskCreateError"
          @status-change="handleTaskStatusChange"
        >
            <template #actions-before="{ activeOp }">
              <UButton
                v-if="activeOp?.key === 'import'"
                :label="`批量导入（${batchImportSourceIds.length}）`"
                icon="i-lucide-list-start"
                color="primary"
                variant="soft"
                :loading="creatingBatchTaskKind === 'import'"
                :disabled="!canStartBatchImport"
                @click="startBatchImport"
              />
              <UButton
                v-else-if="activeOp?.key === 'project'"
                :label="`批量投影（${batchProjectSourceTags.length}）`"
                icon="i-lucide-list-start"
                color="neutral"
                variant="soft"
                :loading="creatingBatchTaskKind === 'project'"
                :disabled="!canStartBatchProject"
                @click="startBatchProject"
              />
            </template>
            <template #import>
              <div class="space-y-4 pt-4">
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
                    v-if="importProgress.totalWorkCount != null || importProgress.totalEntityCount != null || importProgress.totalBatchCount != null"
                    class="space-y-2"
                  >
                    <div
                      class="flex items-center justify-between gap-3 text-xs text-muted"
                    >
                      <span>{{ importProgressMetricLabel }} {{ importProgressCountText }}</span>
                      <span>{{ importProgressPercent }}%</span>
                    </div>
                    <div class="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        class="h-full rounded-full bg-primary transition-all duration-300"
                        :style="{ width: `${importProgressPercent}%` }"
                      />
                    </div>
                  </div>

                  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div class="rounded-lg border border-default p-3">
                      <div class="text-xs text-muted">阶段进度</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ importProgressCountText }}
                      </div>
                      <div class="mt-1 text-xs text-muted">
                        {{ importProgressMetricLabel }}
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
                      <div class="text-xs text-muted">总实体数</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ importProgress.totalEntityCount ?? "-" }}
                      </div>
                    </div>
                    <div class="rounded-lg border border-default p-3">
                      <div class="text-xs text-muted">总耗时</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ importElapsedText }}
                      </div>
                    </div>
                    <div class="rounded-lg border border-default p-3">
                      <div class="text-xs text-muted">阶段耗时</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ importPhaseDurationText }}
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
                    :disabled="hsdataTaskActive"
                    @click="resetImportForm"
                  />
                </div>
              </div>
            </template>

            <template #project>
              <div class="space-y-4 pt-4">
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

                  <label
                    class="flex items-start gap-3 rounded-lg border border-default p-3"
                  >
                    <input
                      v-model="projectForm.skipLatestUpdate"
                      type="checkbox"
                      class="mt-0.5 size-4 rounded border-default"
                    >
                    <span>
                      <span class="block text-sm font-medium">暂缓更新latest</span>
                      <span class="text-xs text-muted"
                        >跳过投影完成后的 isLatest 重新计算，批量投影结束后可手动触发。</span
                      >
                    </span>
                  </label>

                  <label
                    class="flex items-start gap-3 rounded-lg border border-default p-3"
                  >
                    <input
                      v-model="projectForm.sampleDiff"
                      type="checkbox"
                      class="mt-0.5 size-4 rounded border-default"
                    >
                    <span>
                      <span class="block text-sm font-medium">收集差异样本</span>
                      <span class="text-xs text-muted"
                        >将调和前后的差异行采样写入临时目录，用于诊断写入原因。</span
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

                <div
                  v-if="projectProgress"
                  class="space-y-3 rounded-lg border border-default p-3"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div class="text-sm font-medium">投影任务进度</div>
                      <div class="mt-1 text-xs text-muted">
                        {{ projectProgress.message }}
                      </div>
                      <div class="mt-1 text-xs text-muted">
                        {{ projectProgressStageText }}
                      </div>
                    </div>
                    <UBadge
                      :label="projectProgressPhaseLabel"
                      :color="
                        projectProgress.phase === 'failed'
                          ? 'error'
                          : projectProgress.phase === 'completed'
                            ? 'success'
                            : 'primary'
                      "
                      variant="soft"
                    />
                  </div>

                  <div
                    v-if="projectProgress.totalWorkCount != null || projectProgress.totalSnapshotCount != null"
                    class="space-y-2"
                  >
                    <div
                      class="flex items-center justify-between gap-3 text-xs text-muted"
                    >
                      <span>{{ projectProgressMetricLabel }} {{ projectProgressCountText }}</span>
                      <span>{{ projectProgressPercent }}%</span>
                    </div>
                    <div class="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        v-if="projectWriteSegments.length > 0"
                        class="flex h-full transition-all duration-300"
                        :style="{ width: `${projectProgressPercent}%` }"
                      >
                        <div
                          v-for="segment in projectWriteSegments"
                          :key="segment.key"
                          class="h-full transition-all duration-300"
                          :class="segment.colorClass"
                          :style="{ width: `${segment.completedWidthPercent}%` }"
                        />
                      </div>
                      <div
                        v-else
                        class="h-full rounded-full bg-primary transition-all duration-300"
                        :style="{ width: `${projectProgressPercent}%` }"
                      />
                    </div>

                    <div
                      v-if="projectWriteSegments.length > 0"
                      class="grid gap-2 text-[11px] text-muted md:grid-cols-2"
                    >
                      <div
                        v-for="segment in projectWriteSegments"
                        :key="`${segment.key}-legend`"
                        class="flex items-center justify-between gap-3 rounded-lg border border-default px-2 py-1.5"
                      >
                        <div class="flex items-center gap-2">
                          <span
                            class="inline-block size-2 rounded-full"
                            :class="segment.colorClass"
                          />
                          <span>{{ segment.label }}</span>
                        </div>
                        <span class="font-mono text-xs">
                          {{ segment.completedRowCount }} / {{ segment.totalRowCount }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <div class="rounded-lg border border-default p-3">
                      <div class="text-xs text-muted">阶段进度</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ projectProgressCountText }}
                      </div>
                      <div class="mt-1 text-xs text-muted">
                        {{ projectProgressMetricLabel }}
                      </div>
                    </div>
                    <div class="rounded-lg border border-default p-3">
                      <div class="text-xs text-muted">sourceTag</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ projectProgress.sourceTag }}
                      </div>
                    </div>
                    <div class="rounded-lg border border-default p-3">
                      <div class="text-xs text-muted">总 snapshot 数</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ projectProgress.totalSnapshotCount ?? "-" }}
                      </div>
                    </div>
                    <div class="rounded-lg border border-default p-3">
                      <div class="text-xs text-muted">总耗时</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ projectElapsedText }}
                      </div>
                    </div>
                    <div class="rounded-lg border border-default p-3">
                      <div class="text-xs text-muted">阶段耗时</div>
                      <div class="mt-1 break-all font-mono text-sm">
                        {{ projectPhaseDurationText }}
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="projectProgress.reconciledCounts"
                    class="grid gap-3 rounded-lg border border-default p-3 md:grid-cols-3"
                  >
                    <div>
                      <div class="text-xs text-muted">已跳过 (复用)</div>
                      <div class="mt-1 text-sm font-medium text-green-600 dark:text-green-400">
                        {{ (projectProgress.reconciledCounts.reusedEntities + projectProgress.reconciledCounts.reusedLocalizations + projectProgress.reconciledCounts.reusedRelations).toLocaleString() }}
                      </div>
                      <div class="mt-0.5 text-[11px] text-muted">
                        实体 {{ projectProgress.reconciledCounts.reusedEntities.toLocaleString() }}
                        · 本地化 {{ projectProgress.reconciledCounts.reusedLocalizations.toLocaleString() }}
                        · 关系 {{ projectProgress.reconciledCounts.reusedRelations.toLocaleString() }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">新增</div>
                      <div class="mt-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                        {{ (projectProgress.reconciledCounts.insertedEntities + projectProgress.reconciledCounts.insertedLocalizations + projectProgress.reconciledCounts.insertedRelations).toLocaleString() }}
                      </div>
                      <div class="mt-0.5 text-[11px] text-muted">
                        实体 {{ projectProgress.reconciledCounts.insertedEntities.toLocaleString() }}
                        · 本地化 {{ projectProgress.reconciledCounts.insertedLocalizations.toLocaleString() }}
                        · 关系 {{ projectProgress.reconciledCounts.insertedRelations.toLocaleString() }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs text-muted">更新</div>
                      <div class="mt-1 text-sm font-medium text-orange-600 dark:text-orange-400">
                        {{ (projectProgress.reconciledCounts.updatedEntities + projectProgress.reconciledCounts.updatedLocalizations + projectProgress.reconciledCounts.updatedRelations).toLocaleString() }}
                      </div>
                      <div class="mt-0.5 text-[11px] text-muted">
                        实体 {{ projectProgress.reconciledCounts.updatedEntities.toLocaleString() }}
                        · 本地化 {{ projectProgress.reconciledCounts.updatedLocalizations.toLocaleString() }}
                        · 关系 {{ projectProgress.reconciledCounts.updatedRelations.toLocaleString() }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap justify-end gap-2">
                  <UButton
                    label="清空投影参数"
                    icon="i-lucide-rotate-ccw"
                    color="neutral"
                    variant="ghost"
                    :disabled="hsdataTaskActive"
                    @click="resetProjectForm"
                  />
                </div>

                <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-default p-3">
                  <div>
                    <div class="text-sm font-medium">手动更新latest</div>
                    <template v-if="recomputingLatest && recomputeLatestProgress">
                      <div class="mt-1 text-xs text-muted">{{ recomputeLatestProgress.message }}</div>
                      <UProgress
                        v-if="recomputeLatestProgress.totalRowCount && recomputeLatestProgress.completedRowCount != null"
                        class="mt-1 max-w-60"
                        size="xs"
                        :value="recomputeLatestProgress.completedRowCount"
                        :max="recomputeLatestProgress.totalRowCount"
                      />
                    </template>
                    <p v-else class="mt-1 text-xs text-muted">
                      重新扫描本地投影表，计算并更新 isLatest 标记。
                      <template v-if="recomputeLatestResult">
                        上次更新：
                        实体 {{ recomputeLatestResult.entityUpdatedCount }}/{{ recomputeLatestResult.entityRowCount }}，
                        本地化 {{ recomputeLatestResult.localizationUpdatedCount }}/{{ recomputeLatestResult.localizationRowCount }}，
                        关系 {{ recomputeLatestResult.relationUpdatedCount }}/{{ recomputeLatestResult.relationRowCount }}
                      </template>
                    </p>
                  </div>
                  <UButton
                    label="更新latest"
                    icon="i-lucide-refresh-cw"
                    color="neutral"
                    variant="soft"
                    :loading="recomputingLatest"
                    :disabled="hsdataTaskActive"
                    @click="submitRecomputeLatest"
                  />
                </div>

              </div>
            </template>
        </TaskController>
      </div>

      <div class="space-y-4">
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
                  :disabled="!state?.repoPath || hsdataTaskActive"
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
                  :disabled="hsdataTaskActive"
                  @click="toggleSourceSortOrder"
                />

                <label
                  class="flex items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-xs"
                >
                  <input
                    v-model="hideImportedSources"
                    type="checkbox"
                    class="size-3.5 rounded border-default"
                    :disabled="hsdataTaskActive"
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
                    :disabled="hsdataTaskActive"
                  >
                  <span>隐藏已投影</span>
                </label>

                <span class="text-xs text-muted">{{
                  sourceListSummaryText
                }}</span>
              </div>

              <UAlert
                v-if="resetError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="resetError"
                closable
                @close="resetError = ''"
              />

              <!-- Batch reset toolbar -->
              <div
                v-if="selectableItems.length > 0"
                class="flex items-center gap-2 border-t pt-2"
              >
                <label class="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    :checked="allSelected"
                    :indeterminate.prop="selectedSourceTags.size > 0 && !allSelected"
                    class="size-3.5"
                    @change="toggleSelectAll"
                  />
                  全选
                </label>
                <span class="text-xs text-muted">{{
                  selectedSourceTags.size > 0 ? `已选 ${selectedSourceTags.size}` : ''
                }}</span>
                <div class="flex-1" />
                <UButton
                  label="重置导入"
                  icon="i-lucide-rotate-ccw"
                  size="xs"
                  color="warning"
                  variant="soft"
                  :disabled="resetImportCandidates.length === 0 || resettingImport || hsdataTaskActive"
                  @click="openResetImportModal"
                />
                <UButton
                  label="重置投影"
                  icon="i-lucide-rotate-ccw"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  :disabled="resetProjectionCandidates.length === 0 || resettingProjection || hsdataTaskActive"
                  @click="openResetProjectionModal"
                />
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
              <input
                v-if="item.file.sourceTag != null"
                type="checkbox"
                class="size-3.5 shrink-0"
                :checked="selectedSourceTags.has(item.file.sourceTag)"
                @click.stop="toggleSelectSourceTag(item.file.sourceTag!, $event)"
              />
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
            <UButton
              label="打开采样文件夹"
              icon="i-lucide-folder-open"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="openSampleDiffFolder()"
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

      <!-- Write plan + diff breakdown -->
      <div class="rounded-lg border border-default p-3">
        <div class="text-xs text-muted">写入计划 & 差异根源（合并版本后）</div>
        <div class="mt-2 grid gap-2 text-xs md:grid-cols-3">
          <div class="rounded bg-muted px-2 py-1">
            <div class="flex justify-between">
              <span class="font-medium">实体</span>
              <span class="font-mono">写入 {{ (projectResult.entityPlan.upsert + projectResult.entityPlan.delete).toLocaleString() }}</span>
            </div>
            <div class="mt-1 grid grid-cols-2 gap-x-2 text-[11px] text-muted">
              <span>新增/更新 {{ projectResult.entityPlan.upsert.toLocaleString() }}</span>
              <span>删除 {{ projectResult.entityPlan.delete.toLocaleString() }}</span>
              <span>一致跳过 {{ projectResult.entityDiff.versionMatch.toLocaleString() }}</span>
              <span>版本变更 {{ projectResult.entityDiff.versionChanged.toLocaleString() }}</span>
              <span>仅 isLatest {{ projectResult.entityDiff.isLatestChanged.toLocaleString() }}</span>
              <span>孤儿行(build移除) {{ projectResult.entityDiff.orphanVersionChanged.toLocaleString() }}</span>
            </div>
          </div>
          <div class="rounded bg-muted px-2 py-1 md:col-span-2">
            <div class="flex justify-between">
              <span class="font-medium">本地化</span>
              <span class="font-mono">写入 {{ (projectResult.localizationPlan.upsert + projectResult.localizationPlan.delete).toLocaleString() }}</span>
            </div>
            <div class="mt-1 grid grid-cols-2 gap-x-2 text-[11px] text-muted">
              <span>新增/更新 {{ projectResult.localizationPlan.upsert.toLocaleString() }}</span>
              <span>删除 {{ projectResult.localizationPlan.delete.toLocaleString() }}</span>
              <span class="text-green-600">一致跳过 {{ projectResult.localizationDiff.versionMatch.toLocaleString() }}</span>
              <span class="text-orange-600">版本变更 {{ projectResult.localizationDiff.versionChanged.toLocaleString() }}</span>
              <span class="text-yellow-600">仅 isLatest {{ projectResult.localizationDiff.isLatestChanged.toLocaleString() }}</span>
              <span class="text-blue-600">renderHash {{ projectResult.localizationDiff.renderHashChanged?.toLocaleString() ?? '0' }}（null: {{ projectResult.localizationDiff.renderHashNullExisting?.toLocaleString() ?? '0' }}）</span>
              <span class="text-red-600">孤儿行(build移除) {{ projectResult.localizationDiff.orphanVersionChanged.toLocaleString() }}</span>
            </div>
          </div>
          <div class="rounded bg-muted px-2 py-1">
            <div class="flex justify-between">
              <span class="font-medium">关系</span>
              <span class="font-mono">写入 {{ (projectResult.relationPlan.upsert + projectResult.relationPlan.delete).toLocaleString() }}</span>
            </div>
            <div class="mt-1 grid grid-cols-2 gap-x-2 text-[11px] text-muted">
              <span>新增/更新 {{ projectResult.relationPlan.upsert.toLocaleString() }}</span>
              <span>删除 {{ projectResult.relationPlan.delete.toLocaleString() }}</span>
              <span>一致跳过 {{ projectResult.relationDiff.versionMatch.toLocaleString() }}</span>
              <span>版本变更 {{ projectResult.relationDiff.versionChanged.toLocaleString() }}</span>
              <span>仅 isLatest {{ projectResult.relationDiff.isLatestChanged.toLocaleString() }}</span>
              <span>孤儿行(build移除) {{ projectResult.relationDiff.orphanVersionChanged.toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="projectUnprojectedTagRows.length > 0"
        class="rounded-lg border border-default p-3"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-xs text-muted">Unprojected Tag 明细</div>
          <div class="text-xs text-muted">
            显示前 {{ projectUnprojectedTagRows.length }} 项，共
            {{ projectResult.unprojectedTags.length }} 项
          </div>
        </div>
        <div class="mt-3 space-y-2">
          <div
            v-for="tag in projectUnprojectedTagRows"
            :key="`${tag.enumId}:${tag.slug}`"
            class="flex flex-wrap items-center gap-2 rounded-md border border-default px-3 py-2"
          >
            <UBadge
              :label="String(tag.enumId)"
              color="neutral"
              variant="outline"
              size="xs"
            />
            <span class="font-mono text-sm">{{ tag.slug }}</span>
            <span class="ml-auto font-mono text-sm text-muted">
              {{ tag.count }}
            </span>
          </div>
        </div>
      </div>
    </UCard>
    </div>
  </div>

  <!-- Batch reset confirmation modal -->
  <UModal v-model:open="showResetModal">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon :name="resetModalIcon" class="size-5" />
        <span class="font-medium">{{ resetModalTitle }}</span>
      </div>
    </template>
    <template #body>
      <p class="text-sm">{{ resetModalBody }}</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          @click="{ showResetModal = false; }"
        />
        <UButton
          :label="resetModalConfirmLabel"
          :color="resetModalConfirmColor"
          :loading="resettingImport || resettingProjection"
          @click="confirmResetAction"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import type { TaskPageSnapshot, TaskRunStatus } from '@tcg-cards/model/src/task';
import type { TaskControllerMultiTaskItem, TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';
import {
  formatHsdataBytes,
  formatHsdataDate,
  getHsdataErrorMessage,
  getHsdataRepoState,
  syncPatches as syncPatchesApi,
  listLocalHsdataSourceVersions,
  listHsdataSources,
  recomputeLatestHsdataProjection,
  listenHsdataRecomputeLatestProgress,
  resetHsdataImportStatus,
  resetHsdataProjectionStatus,
  syncHsdataRemoteVersions,
} from '~/composables/useHsdataRepo';
import { openDesktopPath } from '~/composables/useDesktopRuntimeClient';
import type {
  HsdataFile,
  HsdataImportProgressEvent,
  HsdataImportReport,
  HsdataRecomputeLatestReport,
  HsdataRecomputeLatestProgressEvent,
  HsdataProjectProgressEvent,
  HsdataSourceVersionStatus,
  HsdataProjectReport,
  HsdataRepoState,
  ReportMetric,
} from '~/composables/useHsdataRepo';

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
  activeWorkflowTab:    'import' | 'project';
  importDryRun:         boolean;
  importForce:          boolean;
  projectSourceTag:     number | null;
  projectDryRun:        boolean;
  projectForce:         boolean;
  projectSkipLatestUpdate: boolean;
}

definePageMeta({
  layout: 'admin',
  title:  '数据导入',
});

const IMPORT_PAGE_STATE_KEY = 'console-desktop-hearthstone-hsdata-import-page';

const route = useRoute();

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
const activeProjectSourceTag = ref<number | null>(null);
const projectProgress = ref<HsdataProjectProgressEvent | null>(null);
const projectResult = ref<HsdataProjectReport | null>(null);
const recomputingLatest = ref(false);
const recomputeLatestResult = ref<HsdataRecomputeLatestReport | null>(null);
const recomputeLatestProgress = ref<HsdataRecomputeLatestProgressEvent | null>(null);
const syncing = ref(false);
const syncingPatches = ref(false);
const syncPatchesProgress = ref<{ current: number; total: number } | null>(null);
const syncPatchesLabel = computed(() => {
  const p = syncPatchesProgress.value;
  return p != null ? `同步 Patches (${p.current}/${p.total})` : '同步 Patches';
});
const sourceSortOrder = ref<SourceListSortOrder>('desc');
const hideImportedSources = ref(false);
const hideProjectedSources = ref(false);
const activeWorkflowTab = ref<'import' | 'project'>('import');
const taskController = ref<{
  attach(snapshot: TaskPageSnapshot): void;
  currentTaskRunId: string | null;
} | null>(null);
const hsdataTaskActive = ref(false);
const creatingBatchTaskKind = ref<'import' | 'project' | null>(null);
const hsdataTaskRunStorageKey = 'hearthstone-hsdata-task-run-id';
const toast = useToast();
const restoredSelectedSourceId = ref<string | null>(null);
const hasRestoredImportPageState = ref(false);
const progressClockMs = ref(Date.now());
let progressClockTimer: number | null = null;
let stopHsdataImportProgressListener: (() => void) | null = null;
let stopHsdataProjectProgressListener: (() => void) | null = null;
const workflowTabs = [
  {
    value: 'import',
    slot:  'import' as const,
    label: '数据导入',
    icon:  'i-lucide-download',
  },
  {
    value: 'project',
    slot:  'project' as const,
    label: '数据投影',
    icon:  'i-lucide-waypoints',
  },
] as const;

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
  skipLatestUpdate: false,
  sampleDiff: false,
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
const batchImportSourceIds = computed(() => visibleSourceListItems.value
  .filter(item => isBatchImportCandidate(item.status, importForm.force))
  .map(item => item.file.id));
const batchProjectSourceTags = computed(() => visibleSourceListItems.value
  .filter(item => isBatchProjectCandidate(item.status, item.file.sourceTag, projectForm.force))
  .map(item => item.file.sourceTag)
  .filter((sourceTag): sourceTag is number => sourceTag != null));

// Batch reset state
const selectedSourceTags = ref<Set<number>>(new Set());
const resettingImport = ref(false);
const resettingProjection = ref(false);
const resetError = ref('');

// Reset confirmation modal
const showResetModal = ref(false);
const resetModalAction = ref<'import' | 'projection'>('import');

const resetModalTitle = computed(() =>
  resetModalAction.value === 'import' ? '重置导入状态' : '重置投影状态',
);
const resetModalIcon = computed(() =>
  resetModalAction.value === 'import' ? 'i-lucide-rotate-ccw' : 'i-lucide-rotate-ccw',
);
const resetModalBody = computed(() => {
  const count = selectedSourceTags.value.size;
  if (resetModalAction.value === 'import') {
    return `确认重置 ${count} 个 sourceTag 的导入和投影状态？`;
  }
  return `确认重置 ${count} 个 sourceTag 的投影状态？`;
});
const resetModalConfirmLabel = computed(() =>
  resetModalAction.value === 'import' ? '重置导入' : '重置投影',
);
const resetModalConfirmColor = computed(() =>
  resetModalAction.value === 'import' ? 'warning' : 'neutral',
);

function confirmResetAction() {
  showResetModal.value = false;
  if (resetModalAction.value === 'import') {
    void resetSelectedImport();
  } else {
    void resetSelectedProjection();
  }
}

const selectableItems = computed(() =>
  visibleSourceListItems.value.filter(item => item.file.sourceTag != null),
);

const selectableSourceTagSet = computed(() => {
  const tags = new Set<number>();
  for (const item of selectableItems.value) {
    if (item.file.sourceTag != null) {
      tags.add(item.file.sourceTag);
    }
  }
  return tags;
});

const allSelected = computed(() => {
  const set = selectableSourceTagSet.value;
  if (set.size === 0) return false;
  for (const tag of set) {
    if (!selectedSourceTags.value.has(tag)) return false;
  }
  return true;
});

const resetImportCandidates = computed(() =>
  selectableItems.value.filter(item =>
    item.file.sourceTag != null
    && item.status?.importStatus === 'completed'
    && selectedSourceTags.value.has(item.file.sourceTag),
  ),
);

const resetProjectionCandidates = computed(() =>
  selectableItems.value.filter(item =>
    item.file.sourceTag != null
    && item.status?.projectionStatus === 'completed'
    && selectedSourceTags.value.has(item.file.sourceTag),
  ),
);

const lastClickedIndex = ref<number | null>(null);

function toggleSelectAll() {
  if (allSelected.value) {
    selectedSourceTags.value = new Set();
  } else {
    selectedSourceTags.value = new Set(selectableSourceTagSet.value);
  }
  lastClickedIndex.value = null;
}

function toggleSelectSourceTag(sourceTag: number, event?: MouseEvent) {
  const next = new Set(selectedSourceTags.value);

  if (event?.shiftKey && lastClickedIndex.value != null) {
    const items = selectableItems.value;
    const currentIndex = items.findIndex(item => item.file.sourceTag === sourceTag);
    const prevIndex = lastClickedIndex.value;
    if (currentIndex !== -1) {
      const [start, end] = prevIndex < currentIndex ? [prevIndex, currentIndex] : [currentIndex, prevIndex];
      // Select all in range based on the state of the anchor item
      const anchorSelected = next.has(items[prevIndex]!.file.sourceTag!);
      for (let i = start; i <= end; i++) {
        const tag = items[i]!.file.sourceTag;
        if (tag == null) continue;
        if (anchorSelected) {
          next.add(tag);
        } else {
          next.delete(tag);
        }
      }
    }
  } else {
    if (next.has(sourceTag)) {
      next.delete(sourceTag);
    } else {
      next.add(sourceTag);
    }
    const items = selectableItems.value;
    lastClickedIndex.value = items.findIndex(item => item.file.sourceTag === sourceTag);
  }

  selectedSourceTags.value = next;
}

function openResetImportModal() {
  resetError.value = '';
  resetModalAction.value = 'import';
  showResetModal.value = true;
}

function openResetProjectionModal() {
  resetError.value = '';
  resetModalAction.value = 'projection';
  showResetModal.value = true;
}

async function resetSelectedImport() {
  const tags = [...selectedSourceTags.value];
  if (tags.length === 0) return;

  resettingImport.value = true;
  try {
    await resetHsdataImportStatus(tags);
    selectedSourceTags.value = new Set();
    await reloadSourceList();
  } catch (error) {
    resetError.value = `重置导入失败：${getHsdataErrorMessage(error)}`;
  } finally {
    resettingImport.value = false;
  }
}

async function resetSelectedProjection() {
  const tags = [...selectedSourceTags.value];
  if (tags.length === 0) return;

  resettingProjection.value = true;
  try {
    await resetHsdataProjectionStatus(tags);
    selectedSourceTags.value = new Set();
    await reloadSourceList();
  } catch (error) {
    resetError.value = `重置投影失败：${getHsdataErrorMessage(error)}`;
  } finally {
    resettingProjection.value = false;
  }
}

const canImport = computed(
  () =>
    Boolean(state.value?.repoPath)
    && importForm.id.trim().length > 0
    && !importing.value,
);
const canProject = computed(
  () => projectForm.sourceTag != null && !projecting.value,
);

/** Single-source import operation rendered in the import task tab. */
const importTaskOperation = computed<TaskOperation>(() => ({
  key: 'import',
  label: '执行导入',
  icon: 'i-lucide-play',
  taskType: 'hearthstone_hsdata_import',
  disabled: !canImport.value || hsdataTaskActive.value,
  create: async () => orpc.hearthstone.createTask.hsdataImport({
    sourceIds: [importForm.id],
    dryRun: importForm.dryRun,
    force: importForm.force,
  }) as Promise<TaskPageSnapshot>,
}));

/** Single-source projection operation rendered in the projection task tab. */
const projectionTaskOperation = computed<TaskOperation>(() => ({
  key: 'project',
  label: '执行投影',
  icon: 'i-lucide-waypoints',
  taskType: 'hearthstone_hsdata_projection',
  disabled: !canProject.value || hsdataTaskActive.value,
  create: async () => orpc.hearthstone.createTask.hsdataProjection({
    sourceTags: [projectForm.sourceTag!],
    dryRun: projectForm.dryRun,
    force: projectForm.force,
    skipLatestUpdate: projectForm.skipLatestUpdate,
    sampleDiff: projectForm.sampleDiff,
  }) as Promise<TaskPageSnapshot>,
}));

/** Task types displayed as mutually exclusive tabs inside TaskController. */
const multiTaskItems = computed<TaskControllerMultiTaskItem[]>(() => [
  {
    key: 'import',
    label: '数据导入',
    icon: 'i-lucide-download',
    taskType: 'hearthstone_hsdata_import',
    operation: importTaskOperation.value,
  },
  {
    key: 'project',
    label: '数据投影',
    icon: 'i-lucide-waypoints',
    taskType: 'hearthstone_hsdata_projection',
    operation: projectionTaskOperation.value,
  },
]);
const canStartBatchImport = computed(() => {
    return Boolean(state.value?.repoPath)
    && batchImportSourceIds.value.length > 0
    && !hsdataTaskActive.value
    && creatingBatchTaskKind.value == null
    && !loadingState.value
    && !loadingFiles.value
    && !loadingSourceVersions.value
    && !syncing.value
    && !importing.value
    && !projecting.value;
});
const canStartBatchProject = computed(() => {
    return Boolean(state.value?.repoPath)
    && batchProjectSourceTags.value.length > 0
    && !hsdataTaskActive.value
    && creatingBatchTaskKind.value == null
    && !loadingState.value
    && !loadingFiles.value
    && !loadingSourceVersions.value
    && !syncing.value
    && !importing.value
    && !projecting.value;
});

/** Formats one started-at timestamp into a compact elapsed duration label. */
function formatElapsedDuration(
  startedAt: string | null | undefined,
  nowMs: number,
  finishedAt?: string | null,
) {
  if (!startedAt) {
    return '-';
  }

  const startedMs = new Date(startedAt).getTime();
  const endMs = finishedAt ? new Date(finishedAt).getTime() : nowMs;

  if (!Number.isFinite(startedMs) || !Number.isFinite(endMs)) {
    return '-';
  }

  const elapsedSeconds = Math.max(0, Math.floor((endMs - startedMs) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Formats one raw duration in milliseconds into the same compact time label used by elapsed counters. */
function formatDurationMs(durationMs: number | null | undefined) {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return '-';
  }

  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Converts one backend work-unit key into the short label shown beside progress counters. */
function formatProgressWorkLabel(workLabel: string | null | undefined) {
  switch (workLabel) {
  case 'entity':
    return '实体';
  case 'snapshot':
    return '快照';
  case 'row':
    return '行';
  case 'operation':
    return '操作';
  case 'source':
    return '来源';
  case 'sourceTag':
    return 'sourceTag';
  default:
    return '阶段';
  }
}

/** Computes one determinate progress percentage from phase work counters or legacy totals. */
function computeProgressPercent(input: {
  completedWorkCount: number | null;
  totalWorkCount: number | null;
  completedCount: number | null;
  totalCount: number | null;
  phase: string | null | undefined;
}) {
  if (input.totalWorkCount != null && input.totalWorkCount > 0) {
    return Math.max(
      0,
      Math.min(100, Math.round(((input.completedWorkCount ?? 0) / input.totalWorkCount) * 100)),
    );
  }

  if (input.totalCount != null && input.totalCount > 0) {
    return Math.max(
      0,
      Math.min(100, Math.round(((input.completedCount ?? 0) / input.totalCount) * 100)),
    );
  }

  return input.phase === 'completed' ? 100 : 0;
}

/** Builds one compact counter label from phase work counters or legacy totals. */
function formatProgressCountText(input: {
  completedWorkCount: number | null;
  totalWorkCount: number | null;
  completedCount: number | null;
  totalCount: number | null;
}) {
  if (input.totalWorkCount != null) {
    return `${input.completedWorkCount ?? 0} / ${input.totalWorkCount}`;
  }

  if (input.totalCount != null) {
    return `${input.completedCount ?? 0} / ${input.totalCount}`;
  }

  return '-';
}

/** Estimates one phase total duration from current phase progress and elapsed time. */
function estimatePhaseTotalDurationMs(input: {
  startedAt: string | null | undefined;
  finishedAt?: string | null;
  nowMs: number;
  completedWorkCount: number | null;
  totalWorkCount: number | null;
  completedCount: number | null;
  totalCount: number | null;
  phase: string | null | undefined;
}) {
  if (input.phase === 'completed') {
    if (!input.startedAt) {
      return null;
    }

    const startedMs = new Date(input.startedAt).getTime();
    const endMs = input.finishedAt ? new Date(input.finishedAt).getTime() : input.nowMs;

    if (!Number.isFinite(startedMs) || !Number.isFinite(endMs)) {
      return null;
    }

    return Math.max(0, endMs - startedMs);
  }

  if (!input.startedAt) {
    return null;
  }

  const startedMs = new Date(input.startedAt).getTime();
  if (!Number.isFinite(startedMs)) {
    return null;
  }

  const elapsedMs = Math.max(0, input.nowMs - startedMs);
  const total = input.totalWorkCount ?? input.totalCount ?? null;
  const completed = input.completedWorkCount ?? input.completedCount ?? null;

  if (total == null || completed == null || total <= 0 || completed <= 0 || completed >= total) {
    return null;
  }

  if (elapsedMs < 2_000) {
    return null;
  }

  const progressRatio = completed / total;
  if (progressRatio < 0.02) {
    return null;
  }

  return Math.round(elapsedMs / progressRatio);
}

/** Builds one `elapsed / estimated-total` label for the current phase. */
function formatPhaseDurationWithEstimate(input: {
  startedAt: string | null | undefined;
  finishedAt?: string | null;
  nowMs: number;
  completedWorkCount: number | null;
  totalWorkCount: number | null;
  completedCount: number | null;
  totalCount: number | null;
  phase: string | null | undefined;
}) {
  const elapsedText = formatElapsedDuration(input.startedAt, input.nowMs, input.finishedAt);
  const estimatedTotalMs = estimatePhaseTotalDurationMs(input);
  const estimatedText = estimatedTotalMs == null ? '-' : formatDurationMs(estimatedTotalMs);
  return `${elapsedText} / ${estimatedText}`;
}

const importProgressPhaseLabel = computed(() => {
  switch (importProgress.value?.phase) {
  case 'reading_source':
    return '读取来源';
  case 'parsing_entities':
    return '解析实体';
  case 'writing_batches':
    return '写入批次';
  case 'finalizing_source_tag':
    return '收口 sourceTag';
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
  case 'reading_source':
    return '正在读取所选版本，并准备开始本地导入。';
  case 'parsing_entities':
    return '正在规范化 XML 实体并组装本地写入批次。';
  case 'writing_batches':
    return '正在按批次写入本地归档，并持续累计实体进度。';
  case 'finalizing_source_tag':
    return '正在重写 sourceTag 的 latest/sourceTags 收口结果。';
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
  return computeProgressPercent({
    completedWorkCount: progress?.completedWorkCount ?? null,
    totalWorkCount:     progress?.totalWorkCount ?? null,
    completedCount:     progress?.completedEntityCount ?? progress?.completedBatchCount ?? null,
    totalCount:         progress?.totalEntityCount ?? progress?.totalBatchCount ?? null,
    phase:              progress?.phase,
  });
});
const importProgressCountText = computed(() => {
  const progress = importProgress.value;
  return formatProgressCountText({
    completedWorkCount: progress?.completedWorkCount ?? null,
    totalWorkCount:     progress?.totalWorkCount ?? null,
    completedCount:     progress?.completedEntityCount ?? progress?.completedBatchCount ?? null,
    totalCount:         progress?.totalEntityCount ?? progress?.totalBatchCount ?? null,
  });
});
const importProgressMetricLabel = computed(() => formatProgressWorkLabel(importProgress.value?.workLabel));
const importElapsedText = computed(() =>
  formatElapsedDuration(
    importProgress.value?.startedAt,
    progressClockMs.value,
    importProgress.value?.finishedAt,
  ));
const importPhaseElapsedText = computed(() =>
  formatElapsedDuration(
    importProgress.value?.phaseStartedAt,
    progressClockMs.value,
    importProgress.value?.finishedAt,
  ));
const importPhaseDurationText = computed(() => {
  const progress = importProgress.value;
  return formatPhaseDurationWithEstimate({
    startedAt:          progress?.phaseStartedAt,
    finishedAt:         progress?.finishedAt,
    nowMs:              progressClockMs.value,
    completedWorkCount: progress?.completedWorkCount ?? null,
    totalWorkCount:     progress?.totalWorkCount ?? null,
    completedCount:     progress?.completedEntityCount ?? progress?.completedBatchCount ?? null,
    totalCount:         progress?.totalEntityCount ?? progress?.totalBatchCount ?? null,
    phase:              progress?.phase,
  });
});
const projectProgressPhaseLabel = computed(() => {
  switch (projectProgress.value?.phase) {
  case 'loading_snapshots':
    return '加载快照';
  case 'loading_tags':
    return '加载标签';
  case 'projecting_snapshots':
    return '投影快照';
  case 'summarizing_changes':
    return '汇总变更';
  case 'writing_rows':
    return '写入结果';
  case 'recomputing_latest':
    return '重算最新';
  case 'completed':
    return '已完成';
  case 'failed':
    return '失败';
  default:
    return '进行中';
  }
});
const projectProgressStageText = computed(() => {
  switch (projectProgress.value?.phase) {
  case 'loading_snapshots':
    return '正在读取当前 sourceTag 关联的 raw snapshot。';
  case 'loading_tags':
    return '正在读取 snapshot tag 和投影配置。';
  case 'projecting_snapshots':
    return '正在把 raw snapshot 转换成实体、本地化和关系行。';
  case 'summarizing_changes':
    return '正在比对现有投影结果并汇总写入差异。';
  case 'writing_rows':
    return '正在把本轮投影结果写入本地 Hearthstone 表。';
  case 'recomputing_latest':
    return '正在重算所有投影表的 isLatest 标记。';
  case 'completed':
    return '投影任务已经完成，可以复查结果或继续发布。';
  case 'failed':
    return '投影任务已停止，请根据上方错误信息排查。';
  default:
    return '正在等待下一条投影进度更新。';
  }
});
const projectProgressPercent = computed(() => {
  const progress = projectProgress.value;
  return computeProgressPercent({
    completedWorkCount: progress?.completedWorkCount ?? null,
    totalWorkCount:     progress?.totalWorkCount ?? null,
    completedCount:     progress?.completedSnapshotCount ?? null,
    totalCount:         progress?.totalSnapshotCount ?? null,
    phase:              progress?.phase,
  });
});
const projectProgressCountText = computed(() => {
  const progress = projectProgress.value;
  return formatProgressCountText({
    completedWorkCount: progress?.completedWorkCount ?? null,
    totalWorkCount:     progress?.totalWorkCount ?? null,
    completedCount:     progress?.completedSnapshotCount ?? null,
    totalCount:         progress?.totalSnapshotCount ?? null,
  });
});
const projectProgressMetricLabel = computed(() => formatProgressWorkLabel(projectProgress.value?.workLabel));
const projectWriteSegments = computed(() => {
  const breakdown = projectProgress.value?.writeBreakdown;

  if (projectProgress.value?.phase !== 'writing_rows' || breakdown == null) {
    return [];
  }

  const items = [
    {
      key:               'entity',
      label:             'Entity',
      colorClass:        'bg-sky-500',
      totalRowCount:     breakdown.entity.totalRowCount,
      completedRowCount: breakdown.entity.completedRowCount,
    },
    {
      key:               'entityDelete',
      label:             'Entity 删除',
      colorClass:        'bg-sky-300',
      totalRowCount:     breakdown.entityDelete.totalRowCount,
      completedRowCount: breakdown.entityDelete.completedRowCount,
    },
    {
      key:               'localization',
      label:             'Localization',
      colorClass:        'bg-amber-500',
      totalRowCount:     breakdown.localization.totalRowCount,
      completedRowCount: breakdown.localization.completedRowCount,
    },
    {
      key:               'localizationDelete',
      label:             'Localization 删除',
      colorClass:        'bg-amber-300',
      totalRowCount:     breakdown.localizationDelete.totalRowCount,
      completedRowCount: breakdown.localizationDelete.completedRowCount,
    },
    {
      key:               'latest',
      label:             'Latest',
      colorClass:        'bg-emerald-500',
      totalRowCount:     breakdown.latest.totalRowCount,
      completedRowCount: breakdown.latest.completedRowCount,
    },
    {
      key:               'relation',
      label:             'Relation',
      colorClass:        'bg-slate-500',
      totalRowCount:     breakdown.relation.totalRowCount,
      completedRowCount: breakdown.relation.completedRowCount,
    },
    {
      key:               'relationDelete',
      label:             'Relation 删除',
      colorClass:        'bg-slate-300',
      totalRowCount:     breakdown.relationDelete.totalRowCount,
      completedRowCount: breakdown.relationDelete.completedRowCount,
    },
    {
      key:               'card',
      label:             'Card',
      colorClass:        'bg-indigo-500',
      totalRowCount:     breakdown.card.totalRowCount,
      completedRowCount: breakdown.card.completedRowCount,
    },
  ];

  const visibleItems = items.filter(item => item.totalRowCount > 0);
  const totalRows = visibleItems.reduce((count, item) => count + item.totalRowCount, 0);
  const completedRows = visibleItems.reduce((count, item) => count + item.completedRowCount, 0);

  return visibleItems.map(item => ({
    ...item,
    completedWidthPercent: completedRows === 0 ? 0 : (item.completedRowCount / completedRows) * 100,
    totalWidthPercent: totalRows === 0 ? 0 : (item.totalRowCount / totalRows) * 100,
  }));
});
const projectElapsedText = computed(() =>
  formatElapsedDuration(
    projectProgress.value?.startedAt,
    progressClockMs.value,
    projectProgress.value?.finishedAt,
  ));
const projectPhaseElapsedText = computed(() =>
  formatElapsedDuration(
    projectProgress.value?.phaseStartedAt,
    progressClockMs.value,
    projectProgress.value?.finishedAt,
  ));
const projectPhaseDurationText = computed(() => {
  const progress = projectProgress.value;
  return formatPhaseDurationWithEstimate({
    startedAt:          progress?.phaseStartedAt,
    finishedAt:         progress?.finishedAt,
    nowMs:              progressClockMs.value,
    completedWorkCount: progress?.completedWorkCount ?? null,
    totalWorkCount:     progress?.totalWorkCount ?? null,
    completedCount:     progress?.completedSnapshotCount ?? null,
    totalCount:         progress?.totalSnapshotCount ?? null,
    phase:              progress?.phase,
  });
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
    { key: 'snapshotCount', label: 'loaded snapshots', value: report.snapshotCount },
    { key: 'skippedSnapshotCount', label: 'skipped snapshots', value: report.skippedSnapshotCount },
    { key: 'totalSnapshotCount', label: 'total snapshots', value: report.totalSnapshotCount },
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

const projectUnprojectedTagRows = computed(() => {
  const rows = projectResult.value?.unprojectedTags ?? [];
  return rows.slice(0, 20);
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
    activeWorkflowTab:    'import' as const,
    importDryRun:         true,
    importForce:          false,
    projectSourceTag:     null,
    projectDryRun:        true,
    projectForce:         false,
    projectSkipLatestUpdate: false,
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
    activeWorkflowTab:
      data.activeWorkflowTab === 'import' || data.activeWorkflowTab === 'project'
        ? data.activeWorkflowTab
        : defaults.activeWorkflowTab,
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
    projectSkipLatestUpdate:
      typeof data.projectSkipLatestUpdate === 'boolean'
        ? data.projectSkipLatestUpdate
        : defaults.projectSkipLatestUpdate,
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
    activeWorkflowTab:    activeWorkflowTab.value,
    importDryRun:         importForm.dryRun,
    importForce:          importForm.force,
    projectSourceTag:     projectForm.sourceTag,
    projectDryRun:        projectForm.dryRun,
    projectForce:         projectForm.force,
    projectSkipLatestUpdate: projectForm.skipLatestUpdate,
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
  activeWorkflowTab.value = state.activeWorkflowTab;
  importForm.dryRun = state.importDryRun;
  importForm.force = state.importForce;
  projectForm.sourceTag = state.projectSourceTag;
  projectForm.dryRun = state.projectDryRun;
  projectForm.force = state.projectForce;
  projectForm.skipLatestUpdate = state.projectSkipLatestUpdate;
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
    return true;
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
    return '正在加载这个 sourceTag 的导入、本地投影与发布状态。';
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
    return '这个 sourceTag 已完成导入和本地投影，可以直接复查结果或继续发布。';
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
  projectProgress.value = null;
  projectResult.value = null;
  projectForm.sourceTag = importForm.sourceTag;
}

/** Project sourceTag aligned with the currently selected import source. */
function useSelectedSourceTag() {
  projectForm.sourceTag = importForm.sourceTag;
}

/** New import batch started from the current visible import candidates. */
async function startBatchImport() {
  if (!canStartBatchImport.value) {
    return;
  }

  creatingBatchTaskKind.value = 'import';

  try {
    await reloadSourceList();
    const sourceIds = [...batchImportSourceIds.value];

    if (sourceIds.length === 0) {
      return;
    }

    const snapshot = await orpc.hearthstone.createTask.hsdataImport({
      sourceIds,
      dryRun: importForm.dryRun,
      force: importForm.force,
    }) as TaskPageSnapshot;
    taskController.value?.attach(snapshot);
  } finally {
    creatingBatchTaskKind.value = null;
  }
}

/** New projection batch started from the current visible projection candidates. */
async function startBatchProject() {
  if (!canStartBatchProject.value) {
    return;
  }

  creatingBatchTaskKind.value = 'project';

  try {
    await reloadSourceList();
    const sourceTags = [...batchProjectSourceTags.value];

    if (sourceTags.length === 0) {
      return;
    }

    const snapshot = await orpc.hearthstone.createTask.hsdataProjection({
      sourceTags,
      dryRun: projectForm.dryRun,
      force: projectForm.force,
      skipLatestUpdate: projectForm.skipLatestUpdate,
      sampleDiff: projectForm.sampleDiff,
    }) as TaskPageSnapshot;
    taskController.value?.attach(snapshot);
  } finally {
    creatingBatchTaskKind.value = null;
  }
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

/** Persisted sourceTag statuses loaded from the local desktop database. */
async function loadSourceVersions() {
  loadingSourceVersions.value = true;
  sourceVersionError.value = '';

  try {
    sourceVersions.value = await listLocalHsdataSourceVersions();
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

/** Syncs only patch metadata (name/shortName/hash) for all available sources. */
async function syncPatches() {
  syncingPatches.value = true;
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  try {
    const result = await syncPatchesApi();
    syncPatchesProgress.value = { current: result.count, total: result.count };

    toast.add({
      title:       'Patches 同步完成',
      description: `已同步 ${result.count} 个 patch`,
      color:       'success',
    });
  } catch (error) {
    console.error('Failed to sync patches:', error);
    toast.add({
      title:       'Patches 同步失败',
      description: getHsdataErrorMessage(error),
      color:       'error',
    });
  } finally {
    syncingPatches.value = false;
  }
}

/** Applies one completed hsdata task result to the existing report panels. */
function handleTaskCompleted(snapshot: TaskPageSnapshot) {
  hsdataTaskActive.value = false;
  localStorage.removeItem(hsdataTaskRunStorageKey);
  const reports = Array.isArray(snapshot.result?.reports) ? snapshot.result.reports : [];
  if (snapshot.pageTask.kind !== 'attached') return;

  if (snapshot.pageTask.taskType === 'hearthstone_hsdata_import') {
    importResult.value = reports.length === 1 ? reports[0] as HsdataImportReport : null;
  } else if (snapshot.pageTask.taskType === 'hearthstone_hsdata_projection') {
    projectResult.value = reports.length === 1
      ? { ...reports[0] as HsdataProjectReport, unprojectedTags: [] }
      : null;
  }

  void loadSourceVersions();
}

/** Clears page-level active state after one task failure. */
function handleTaskFailed(_taskRunId: string, _errorCode: string | null, errorMessage: string | null) {
  hsdataTaskActive.value = false;
  localStorage.removeItem(hsdataTaskRunStorageKey);
  if (errorMessage) {
    toast.add({ title: 'hsdata 任务失败', description: errorMessage, color: 'error' });
  }
}

/** Reports one task creation failure through the page toast. */
function handleTaskCreateError(_operationKey: string, message: string) {
  toast.add({ title: '无法创建 hsdata 任务', description: message, color: 'error' });
}

/** Tracks whether the shared TaskController currently locks workflow creation. */
function handleTaskStatusChange(status: TaskRunStatus) {
  hsdataTaskActive.value = !['completed', 'failed', 'canceled', 'abandoned'].includes(status);
}

/** Current local latest projection published to the configured remote target. */

async function openSampleDiffFolder() {
  try {
    const p = projectResult.value?.sampleDiffPath ?? '/tmp/hsdata-diff-samples';
    const dir = p.lastIndexOf('/') > 0 ? p.substring(0, p.lastIndexOf('/')) : p;
    await openDesktopPath(dir);
  } catch (error) {
    console.error('Failed to open sample folder:', error);
  }
}

async function submitRecomputeLatest() {
  recomputingLatest.value = true;
  recomputeLatestResult.value = null;
  recomputeLatestProgress.value = null;

  const stopListening = listenHsdataRecomputeLatestProgress(event => {
    recomputeLatestProgress.value = event;
  });

  try {
    const result = await recomputeLatestHsdataProjection();
    recomputeLatestResult.value = result;
    toast.add({
      title:       'latest 已更新',
      description: `entity ${result.entityUpdatedCount}/${result.entityRowCount} · localization ${result.localizationUpdatedCount}/${result.localizationRowCount} · relation ${result.relationUpdatedCount}/${result.relationRowCount}`,
      color:       'success',
    });
  } catch (error) {
    console.error('Failed to recompute latest projection:', error);
    toast.add({
      title:       '更新 latest 失败',
      description: getHsdataErrorMessage(error),
      color:       'error',
    });
  } finally {
    stopListening();
    recomputingLatest.value = false;
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
    activeWorkflowTab,
    () => importForm.id,
    () => importForm.dryRun,
    () => importForm.force,
    () => projectForm.sourceTag,
    () => projectForm.dryRun,
    () => projectForm.force,
    () => projectForm.skipLatestUpdate,
  ],
  () => {
    persistImportPageState();
  },
);

watch(
  () => taskController.value?.currentTaskRunId ?? null,
  (taskRunId) => {
    if (taskRunId == null) {
      localStorage.removeItem(hsdataTaskRunStorageKey);
    } else {
      localStorage.setItem(hsdataTaskRunStorageKey, taskRunId);
    }
  },
  { immediate: true },
);

onMounted(async () => {
  restoreImportPageState();
  progressClockTimer = window.setInterval(() => {
    progressClockMs.value = Date.now();
  }, 500);

  const persistedTaskRunId = localStorage.getItem(hsdataTaskRunStorageKey);
  if (persistedTaskRunId) {
    const snapshot = await orpc.task.snapshot({ taskRunId: persistedTaskRunId }) as TaskPageSnapshot;
    if (snapshot.pageTask.kind === 'attached') {
      taskController.value?.attach(snapshot);
    } else {
      localStorage.removeItem(hsdataTaskRunStorageKey);
    }
  }

  await reloadAll(resolvePreferredSelectionId());
  hasRestoredImportPageState.value = true;
  persistImportPageState();
});

onBeforeUnmount(() => {
  if (progressClockTimer != null) {
    clearInterval(progressClockTimer);
    progressClockTimer = null;
  }

  stopHsdataImportProgressListener?.();
  stopHsdataImportProgressListener = null;
  stopHsdataProjectProgressListener?.();
  stopHsdataProjectProgressListener = null;
});
</script>
