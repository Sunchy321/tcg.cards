<template>
  <div class="h-full space-y-4 overflow-y-auto">
    <UCard>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-upload" class="size-5 text-primary-500" />
          <h1 class="text-xl font-semibold">发布</h1>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <template v-if="hasPublishTarget">
            <span class="text-muted">{{ publishTarget }}</span>
            <span class="text-muted">·</span>
            <UDropdownMenu
              v-if="hasMultiplePublishTargets"
              :items="environmentItems"
              :disabled="publishTargets.length === 0"
              :content="{ align: 'end' }"
            >
              <button
                type="button"
                class="inline-flex items-center gap-1 text-muted transition-colors hover:text-default disabled:cursor-default disabled:hover:text-muted"
              >
                {{ selectedPublishTarget?.environment ?? '' }}
                <UIcon
                  name="i-lucide-chevron-down"
                  class="size-3 opacity-70"
                />
              </button>
            </UDropdownMenu>
            <span v-else class="text-muted">
              {{ selectedPublishTarget?.environment ?? '' }}
            </span>
            <UBadge :label="formatPublishTargetFingerprint(selectedPublishTarget?.targetFingerprint ?? null)" color="neutral" variant="soft" size="xs" />
          </template>
          <span v-else class="text-muted">未配置</span>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="loadPublishTarget"
          />
        </div>
      </div>

      <UAlert
        v-if="!hasPublishTarget && publishTargetError.length === 0"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="未配置发布目标"
        description="请在 设置 → 发布配置 中配置 Hearthstone 的发布环境。"
        class="mt-2"
      />

      <UAlert
        v-if="publishTargetError.length > 0"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="加载发布目标失败"
        :description="publishTargetError"
        class="mt-2"
      />
    </UCard>

    <UAlert
      v-if="incompleteBatch"
      color="warning"
      variant="soft"
      icon="i-lucide-clock-arrow-up"
      title="检测到未完成的发布批次"
      :description="`批次 ${incompleteBatch.batchId} 尚未完成，仍有 ${incompleteBatch.pendingRowCount ?? '?'} 行待处理。点击「发布当前本地投影」将从中断位置继续。`"
      class="mb-0"
    />

    <TaskController
      ref="controller"
      title="Hearthstone 发布"
      :operations="operations"
      @completed="onCompleted"
      @failed="onFailed"
      @create-error="onCreateError"
    >
      <template #params="{ disabled }">
        <div class="flex items-center gap-6">
          <UFormField label="发布类型" orientation="horizontal">
            <USelect
              v-model="publishType"
              :items="publishTypes"
              :disabled="disabled"
              option-attribute="label"
              class="w-64"
            />
          </UFormField>
          <UCheckbox v-model="dryRun" label="Dry Run" :disabled="disabled" />
          <UCheckbox v-model="force" label="Force" :disabled="disabled" />
        </div>
      </template>
    </TaskController>

    <UCard v-if="taskResult">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-medium">{{ isPurgeResult ? '清理报告' : taskResult.operationKind === 'pin' ? 'Pin 报告' : '发布报告' }}</span>
          <UBadge
            :label="isPurgeResult ? '清理' : taskResult.operationKind === 'pin' ? 'Pin' : taskResult.dryRun ? 'Dry Run' : 'Success'"
            :color="isPurgeResult ? 'error' : taskResult.operationKind === 'pin' ? 'warning' : taskResult.dryRun ? 'warning' : 'success'"
            variant="soft"
          />
        </div>
      </template>

      <div v-if="purgeReport" class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">状态</div>
          <div class="mt-1 flex items-center">
            <UBadge
              :label="purgeReport.dryRun ? 'Dry Run' : 'Success'"
              :color="purgeReport.dryRun ? 'warning' : 'success'"
              variant="soft"
              size="xs"
            />
            <UBadge
              v-if="purgeReport.failures > 0"
              :label="`失败 ${purgeReport.failures}`"
              color="error"
              variant="soft"
              size="xs"
              class="ml-2"
            />
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">孤立 renderHash</div>
          <div class="mt-1 font-mono text-sm">{{ purgeReport.orphanRenderHashes }}</div>
        </div>
        <div class="rounded-lg border border-default p-3 sm:col-span-2">
          <div class="text-xs text-muted">清理行数</div>
          <div class="mt-1 grid grid-cols-3 gap-2 text-sm">
            <div>
              <span class="text-muted">Entities</span>
              <span class="ml-1 font-mono">{{ purgeReport.entities }}</span>
            </div>
            <div>
              <span class="text-muted">Localizations</span>
              <span class="ml-1 font-mono">{{ purgeReport.localizations }}</span>
            </div>
            <div>
              <span class="text-muted">Relations</span>
              <span class="ml-1 font-mono">{{ purgeReport.relations }}</span>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-default p-3 sm:col-span-2">
          <div class="text-xs text-muted">清理图片</div>
          <div class="mt-1 grid grid-cols-2 gap-2 text-sm">
            <div>
              <span class="text-muted">Assets</span>
              <span class="ml-1 font-mono">{{ purgeReport.images.assets }}</span>
            </div>
            <div>
              <span class="text-muted">Files</span>
              <span class="ml-1 font-mono">{{ purgeReport.images.files }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="!isAnnouncementPublishResult" class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">批次</div>
          <div class="mt-1 break-all font-mono text-sm">
            {{ taskResult.batchId }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">Manifest</div>
          <div class="mt-1 break-all font-mono text-sm">
            {{ taskResult.manifestHash }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">操作</div>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <UBadge
              :label="formatPublishOperationKind(taskResult.operationKind as string)"
              color="primary"
              variant="soft"
              size="xs"
            />
            <UBadge
              :label="formatPublishType(taskResult.publishType as string)"
              color="neutral"
              variant="soft"
              size="xs"
            />
            <UBadge
              :label="formatPublishStatus(taskResult.status as string)"
              :color="statusBadgeColor(taskResult.status as string)"
              variant="soft"
              size="xs"
            />
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">变化统计</div>
          <div class="mt-1 font-mono text-sm">
            {{ taskResult.changedRowCount }} / {{ taskResult.totalRowCount }}
          </div>
          <div class="mt-1 text-xs text-muted">
            +{{ taskResult.insertedRowCount }}
            ~{{ taskResult.updatedRowCount }}
            -{{ taskResult.deletedRowCount }}
            ={{ taskResult.unchangedRowCount }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">发布时间</div>
          <div class="mt-1 break-all font-mono text-sm">
            {{ formatHsdataDate(taskResult.publishedAt as string) }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3 sm:col-span-2">
          <div class="text-xs text-muted">分表统计</div>
          <div class="mt-1 grid grid-cols-4 gap-2 text-sm">
            <div>
              <span class="text-muted">Cards</span>
              <span class="ml-1 font-mono">{{ taskResult.cardRowCount }}</span>
            </div>
            <div>
              <span class="text-muted">Entities</span>
              <span class="ml-1 font-mono">{{ taskResult.entityRowCount }}</span>
            </div>
            <div>
              <span class="text-muted">Localizations</span>
              <span class="ml-1 font-mono">{{ taskResult.localizationRowCount }}</span>
            </div>
            <div>
              <span class="text-muted">Relations</span>
              <span class="ml-1 font-mono">{{ taskResult.relationRowCount }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">发布类型</div>
          <div class="mt-1 font-mono text-sm">公告数据</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">状态</div>
          <div class="mt-1 flex items-center">
            <UBadge
              :label="taskResult.dryRun ? 'Dry Run' : 'Success'"
              :color="taskResult.dryRun ? 'warning' : 'success'"
              variant="soft"
              size="xs"
            />
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">公告数</div>
          <div class="mt-1 font-mono text-sm">{{ taskResult.announcementCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">条目数</div>
          <div class="mt-1 font-mono text-sm">{{ taskResult.itemCount }}</div>
        </div>
      </div>
    </UCard>

    <UCard v-if="batchList.length > 0">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">发布历史</span>
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="batchListLoading"
            @click="loadBatchList"
          />
        </div>
      </template>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-xs text-muted">
              <th class="px-3 py-2 font-normal">批次 ID</th>
              <th class="px-3 py-2 font-normal">操作</th>
              <th class="px-3 py-2 font-normal">状态</th>
              <th class="px-3 py-2 font-normal">变化行数</th>
              <th class="px-3 py-2 font-normal">发布时间</th>
              <th class="px-3 py-2 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="batch in batchList"
              :key="batch.batchId"
              class="border-b border-default"
            >
              <td class="max-w-48 truncate px-3 py-2 font-mono text-xs">
                {{ batch.batchId }}
              </td>
              <td class="px-3 py-2">
                <div class="flex flex-wrap items-center gap-1">
                  <UBadge
                    :label="formatPublishOperationKind(batch.operationKind)"
                    color="primary"
                    variant="soft"
                    size="xs"
                  />
                  <UBadge
                    :label="formatPublishType(batch.publishType)"
                    color="neutral"
                    variant="soft"
                    size="xs"
                  />
                </div>
              </td>
              <td class="px-3 py-2">
                <UBadge
                  :label="formatPublishStatus(batch.status)"
                  :color="statusBadgeColor(batch.status)"
                  variant="soft"
                  size="xs"
                />
              </td>
              <td class="px-3 py-2 font-mono text-xs">
                {{ batch.changedRowCount }} / {{ batch.totalRowCount }}
              </td>
              <td class="px-3 py-2 text-xs text-muted">
                {{ formatHsdataDate(batch.publishedAt) }}
              </td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-1">
                  <UButton
                    label="删除"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    :loading="deletingBatchId === batch.batchId"
                    :disabled="deletingBatchId.length > 0"
                    @click="deleteBatch(batch)"
                  />
                  <UButton
                    v-if="isCancelableBatch(batch)"
                    label="取消"
                    icon="i-lucide-x"
                    color="error"
                    variant="soft"
                    size="xs"
                    :loading="cancelingBatchId === batch.batchId"
                    :disabled="cancelingBatchId.length > 0 || deletingBatchId.length > 0"
                    @click="cancelBatch(batch)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-wrench" class="size-4 text-warning-500" />
          <span class="font-medium">Dev: 单卡发布</span>
        </div>
      </template>

      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <UInput
            v-model="singleCardId"
            placeholder="输入 cardId"
            :disabled="singleCardPublishing"
            class="max-w-xs"
          />
          <UButton
            label="发布单张卡牌"
            icon="i-lucide-send"
            :loading="singleCardPublishing"
            :disabled="!hasPublishTarget || !singleCardId.trim()"
            @click="submitSingleCardPublish"
          />
        </div>

        <UAlert
          v-if="singleCardError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="singleCardError"
        />

        <div
          v-if="singleCardResult"
          class="grid gap-2 sm:grid-cols-4"
        >
          <div class="rounded border border-default p-2 text-center">
            <div class="text-xs text-muted">Entities</div>
            <div class="font-mono text-lg">{{ singleCardResult.entityCount }}</div>
          </div>
          <div class="rounded border border-default p-2 text-center">
            <div class="text-xs text-muted">Localizations</div>
            <div class="font-mono text-lg">{{ singleCardResult.localizationCount }}</div>
          </div>
          <div class="rounded border border-default p-2 text-center">
            <div class="text-xs text-muted">Relations</div>
            <div class="font-mono text-lg">{{ singleCardResult.relationCount }}</div>
          </div>
          <div class="rounded border border-default p-2 text-center">
            <div class="text-xs text-muted">Cards</div>
            <div class="font-mono text-lg">{{ singleCardResult.cardCount }}</div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Pin confirmation modal -->
    <UModal v-model:open="showPinConfirm">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-pin" class="size-5" />
          <span class="font-medium">确认 Pin</span>
        </div>
      </template>
      <template #body>
        <p class="text-sm">
          即将对 <strong>{{ selectedEnvironment }}</strong> 环境执行 Pin 操作。
        </p>
        <p class="mt-2 text-sm text-muted">
          Pin 会将当前本地投影标记为已同步状态，更新本地 baseline 和远程 ledger，不会传输任何数据。Pin 之后执行 Publish 应为空操作。
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="cancelPin" />
          <UButton label="确认 Pin" color="warning" @click="confirmPin" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="purgeOpen" title="确认清理" description="将硬删除 entities / entity_localizations / entity_relations 中所有已标记删除的行，并删除对应的孤立图片。此操作不可撤销。">
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="cancelPurge" />
          <UButton label="确认清理" color="error" @click="executePurge" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import {
  getDesktopPublishTargets,
  type DesktopPublishTarget,
} from '~/composables/useDesktopSettings';
import {
  cancelIncompleteHsdataPublishBatch,
  deletePublishHistory,
  formatHsdataDate,
  getHsdataErrorMessage,
  getIncompletePublishBatch,
  listPublishHistory,
  publishSingleCard,
  type HsdataPublishReport,
  type HsdataPublishStreamInput,
  type HsdataSingleCardPublishReport,
} from '~/composables/useHsdataRepo';
import type { TaskPageSnapshot } from '@tcg-cards/model/src/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({
  layout: 'admin',
  title:  '发布',
});

const publishTypes = [
  { label: 'card_data', value: 'card_data' },
  { label: 'announcement_data', value: 'announcement_data' },
];
const publishTarget = 'hearthstone' as const;

const toast = useToast();
const publishTargets = ref<DesktopPublishTarget[]>([]);
const selectedEnvironment = ref('');
const publishTargetError = ref('');
const taskResult = ref<Record<string, unknown> | null>(null);
/** Whether the last result came from the announcement publish task (different output shape). */
const isAnnouncementPublishResult = computed(() => taskResult.value != null && taskResult.value.announcementCount != null);

interface PurgeReport {
  dryRun:             boolean;
  entities:           number;
  localizations:      number;
  relations:          number;
  images:             { assets: number, files: number };
  orphanRenderHashes: number;
  failures:           number;
}

const purgeReport = computed<PurgeReport | null>(() => {
  if (taskResult.value == null || taskResult.value.images == null) return null;
  return taskResult.value as unknown as PurgeReport;
});

const isPurgeResult = computed(() => purgeReport.value != null);
const incompleteBatch = ref<(HsdataPublishReport & { pendingRowCount?: number }) | null>(null);
const batchListLoading = ref(false);
const batchList = ref<HsdataPublishReport[]>([]);
const cancelingBatchId = ref('');
const deletingBatchId = ref('');
const publishType = ref('card_data');
const dryRun = ref(false);
const force = ref(false);

// Purge confirmation flow — the create promise resolves once the user confirms the modal.
const purgeOpen = ref(false);
let resolvePurgeCreate: ((value: TaskPageSnapshot) => void) | null = null;
let rejectPurgeCreate: ((reason: Error) => void) | null = null;

async function executePurge() {
  purgeOpen.value = false;
  try {
    const result = await orpc.hearthstone.createTask.purge({ dryRun: dryRun.value });
    resolvePurgeCreate?.(result as TaskPageSnapshot);
  } catch (error) {
    rejectPurgeCreate?.(error instanceof Error ? error : new Error(getHsdataErrorMessage(error)));
  }
}

function cancelPurge() {
  purgeOpen.value = false;
  rejectPurgeCreate?.(new Error('Cancelled'));
}

const singleCardId = ref('');
const singleCardPublishing = ref(false);
const singleCardResult = ref<HsdataSingleCardPublishReport | null>(null);
const singleCardError = ref('');

const environmentItems = computed(() => {
  return publishTargets.value.map(target => ({
    label:    target.environment,
    value:    target.environment,
    onSelect: () => {
      selectedEnvironment.value = target.environment;
    },
  }));
});

const hasMultiplePublishTargets = computed(() => publishTargets.value.length > 1);

const selectedPublishTarget = computed(() => {
  return publishTargets.value.find(target => target.environment === selectedEnvironment.value) ?? null;
});

const selectedPublishStream = computed<HsdataPublishStreamInput | null>(() => {
  if (selectedEnvironment.value.length === 0) {
    return null;
  }

  return {
    publishTarget,
    environment: selectedEnvironment.value,
  };
});

async function submitSingleCardPublish() {
  const cardId = singleCardId.value.trim();
  const stream = selectedPublishStream.value;

  if (!cardId || !stream) return;

  singleCardPublishing.value = true;
  singleCardError.value = '';
  singleCardResult.value = null;

  try {
    const result = await publishSingleCard(cardId, stream);
    singleCardResult.value = result;
  } catch (error) {
    console.error('Failed to publish single card:', error);
    singleCardError.value = getHsdataErrorMessage(error);
  } finally {
    singleCardPublishing.value = false;
  }
}

const hasPublishTarget = computed(() => {
  return selectedPublishTarget.value != null;
});

function formatPublishTargetFingerprint(fingerprint: string | null) {
  return fingerprint?.slice(0, 8) ?? '';
}

function formatPublishOperationKind(kind: string) {
  switch (kind) {
  case 'publish': return '发布';
  case 'pin': return 'Pin';
  case 'repair': return '修复';
  case 'rollback': return '回滚';
  default: return kind;
  }
}

function formatPublishType(type: string) {
  switch (type) {
  case 'card_data': return '卡牌数据';
  case 'announcement_data': return '公告数据';
  default: return type;
  }
}

function statusBadgeColor(status: string) {
  switch (status) {
  case 'completed': return 'success';
  case 'failed': return 'error';
  case 'canceled': return 'warning';
  case 'abandoned': return 'neutral';
  case 'stopped': return 'warning';
  default: return 'primary';
  }
}

function formatPublishStatus(status: string) {
  switch (status) {
  case 'pending': return '等待中';
  case 'planning': return '规划中';
  case 'applying': return '执行中';
  case 'running': return '执行中';
  case 'paused': return '已暂停';
  case 'stopped': return '已停止';
  case 'completed': return '已完成';
  case 'failed': return '失败';
  case 'canceled': return '已取消';
  case 'abandoned': return '已废弃';
  default: return status;
  }
}

/** Returns whether one history row can be canceled from residual local database state. */
function isCancelableBatch(batch: HsdataPublishReport) {
  return batch.status === 'planning' || batch.status === 'applying';
}

const controller = ref<{ attach(snapshot: TaskPageSnapshot): void, currentTaskRunId: string | null }>();

const showPinConfirm = ref(false);
let resolvePinCreate: ((value: TaskPageSnapshot) => void) | null = null;
let rejectPinCreate: ((reason: Error) => void) | null = null;

function confirmPin() {
  showPinConfirm.value = false;
  orpc.hearthstone.createTask.pin({
    publishTarget: 'hearthstone',
    environment:   selectedEnvironment.value,
  }).then(result => {
    resolvePinCreate?.(result as TaskPageSnapshot);
  }).catch(e => {
    rejectPinCreate?.(e as Error);
  });
}

function cancelPin() {
  showPinConfirm.value = false;
  rejectPinCreate?.(new Error('Cancelled'));
}

const operations: TaskOperation[] = [
  {
    key:    'publish',
    label:  '发布',
    icon:   'i-lucide-upload',
    create: async () => {
      if (publishType.value === 'announcement_data') {
        return orpc.hearthstone.createTask.announcementPublish({
          publishTarget: 'hearthstone',
          environment:   selectedEnvironment.value,
          dryRun:        dryRun.value,
        }) as Promise<TaskPageSnapshot>;
      }
      return orpc.hearthstone.createTask.publish({
        publishTarget: 'hearthstone',
        environment:   selectedEnvironment.value,
        dryRun:        dryRun.value,
        force:         force.value,
      }) as Promise<TaskPageSnapshot>;
    },
  },
  {
    key:    'pin',
    label:  'Pin',
    icon:   'i-lucide-pin',
    color:  'warning',
    create: async () => {
      return new Promise<TaskPageSnapshot>((resolve, reject) => {
        resolvePinCreate = resolve;
        rejectPinCreate = reject;
        showPinConfirm.value = true;
      });
    },
  },
  {
    key:    'purge',
    label:  '清空已删除行',
    icon:   'i-lucide-trash-2',
    color:  'error',
    create: async () => {
      return new Promise<TaskPageSnapshot>((resolve, reject) => {
        resolvePurgeCreate = resolve;
        rejectPurgeCreate = reject;
        purgeOpen.value = true;
      });
    },
  },
];

function onCompleted(snap: TaskPageSnapshot) {
  persistedTaskRunId = null;
  persistPublishPageState();
  taskResult.value = snap.result ?? null;
  refreshPublishState();
}

function onFailed(_taskRunId: string, _errorCode: string | null, _errorMessage: string | null) {
  persistedTaskRunId = null;
  persistPublishPageState();
}

function onCreateError(_opKey: string, _message: string) {
}

// Save taskRunId whenever the controller starts/restores a task
watch(
  () => controller.value?.currentTaskRunId ?? null,
  id => {
    persistedTaskRunId = id;
    persistPublishPageState();
  },
);

async function loadPublishTarget() {
  publishTargetError.value = '';

  try {
    const targets = await getDesktopPublishTargets();
    publishTargets.value = targets.filter(target => target.publishTarget === publishTarget);

    if (publishTargets.value.length === 0) {
      selectedEnvironment.value = '';
      return;
    }

    if (!publishTargets.value.some(target => target.environment === selectedEnvironment.value)) {
      selectedEnvironment.value = publishTargets.value[0]!.environment;
    }
  } catch (error) {
    console.error('Failed to load publish target:', error);
    publishTargetError.value = getHsdataErrorMessage(error);
    publishTargets.value = [];
    selectedEnvironment.value = '';
  }
}

/** Cancels one incomplete batch row when it is no longer backed by a live runtime job. */
async function cancelBatch(batch: HsdataPublishReport) {
  const stream = selectedPublishStream.value;

  if (!stream || !isCancelableBatch(batch) || cancelingBatchId.value.length > 0) {
    return;
  }

  cancelingBatchId.value = batch.batchId;

  try {
    const result = await cancelIncompleteHsdataPublishBatch({
      ...stream,
      batchId: batch.batchId,
    });

    if (incompleteBatch.value?.batchId === batch.batchId) {
      incompleteBatch.value = null;
    }

    toast.add({
      title:       '批次已取消',
      description: `${result.batchId} 已标记为已停止`,
      color:       'success',
    });
    await refreshPublishState();
  } catch (error) {
    console.error('Failed to cancel incomplete publish batch:', error);
    toast.add({
      title:       '取消失败',
      description: getHsdataErrorMessage(error),
      color:       'error',
    });
  } finally {
    cancelingBatchId.value = '';
  }
}

async function deleteBatch(batch: HsdataPublishReport) {
  if (deletingBatchId.value.length > 0) return;

  deletingBatchId.value = batch.batchId;

  try {
    await deletePublishHistory(batch.batchId);
    batchList.value = batchList.value.filter(b => b.batchId !== batch.batchId);
  } catch (error) {
    console.error('Failed to delete publish history:', error);
    toast.add({
      title:       '删除失败',
      description: getHsdataErrorMessage(error),
      color:       'error',
    });
  } finally {
    deletingBatchId.value = '';
  }
}

async function loadIncompleteBatch() {
  const stream = selectedPublishStream.value;

  if (!stream) {
    incompleteBatch.value = null;
    return;
  }

  try {
    incompleteBatch.value = await getIncompletePublishBatch(stream);
  } catch {
    incompleteBatch.value = null;
  }
}

async function loadBatchList() {
  const stream = selectedPublishStream.value;

  batchListLoading.value = true;

  if (!stream) {
    batchList.value = [];
    batchListLoading.value = false;
    return;
  }

  try {
    batchList.value = await listPublishHistory({ ...stream, publishType: publishType.value });
  } catch {
    batchList.value = [];
  } finally {
    batchListLoading.value = false;
  }
}

async function refreshPublishState() {
  await Promise.all([loadBatchList(), loadIncompleteBatch()]);
}

const PUBLISH_PAGE_STATE_KEY = 'console-desktop-hearthstone-publish-page';

interface PublishPageState {
  dryRun:      boolean;
  force:       boolean;
  environment: string;
  publishType: string;
  taskRunId?:  string | null;
}

const PUBLISH_TYPES = ['card_data', 'announcement_data'];

let persistedTaskRunId: string | null = null;

function persistPublishPageState() {
  const state: PublishPageState = {
    dryRun:      dryRun.value,
    force:       force.value,
    environment: selectedEnvironment.value,
    publishType: publishType.value,
    taskRunId:   persistedTaskRunId,
  };
  window.localStorage.setItem(PUBLISH_PAGE_STATE_KEY, JSON.stringify(state));
}

function normalizePublishPageState(raw: Partial<PublishPageState>): PublishPageState {
  return {
    dryRun:      typeof raw.dryRun === 'boolean' ? raw.dryRun : false,
    force:       typeof raw.force === 'boolean' ? raw.force : false,
    environment: typeof raw.environment === 'string' ? raw.environment : '',
    publishType: typeof raw.publishType === 'string' && PUBLISH_TYPES.includes(raw.publishType) ? raw.publishType : 'card_data',
    taskRunId:   typeof raw.taskRunId === 'string' ? raw.taskRunId : null,
  };
}

function restorePublishPageState() {
  try {
    const raw = window.localStorage.getItem(PUBLISH_PAGE_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const state = normalizePublishPageState(parsed);
    dryRun.value = state.dryRun;
    force.value = state.force ?? false;
    selectedEnvironment.value = state.environment;
    publishType.value = state.publishType;
    persistedTaskRunId = state.taskRunId ?? null;
  } catch {
    window.localStorage.removeItem(PUBLISH_PAGE_STATE_KEY);
  }
}

watch([dryRun, force, selectedEnvironment, publishType], () => {
  persistPublishPageState();
});

watch(selectedPublishStream, async () => {
  taskResult.value = null;
  singleCardError.value = '';
  singleCardResult.value = null;
  await refreshPublishState();
});

watch(publishType, () => {
  void refreshPublishState();
});

onMounted(async () => {
  restorePublishPageState();
  await loadPublishTarget();
  await refreshPublishState();

  // Restore active task from persisted taskRunId
  if (persistedTaskRunId) {
    try {
      const snap = await orpc.task.snapshot({ taskRunId: persistedTaskRunId });
      if (snap.pageTask.kind !== 'idle') {
        controller.value?.attach(snap);
      }
    } catch {
      persistedTaskRunId = null;
    }
  }
});
</script>
