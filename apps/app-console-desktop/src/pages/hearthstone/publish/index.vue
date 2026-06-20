<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import {
  getDesktopPublishTargets,
  type DesktopPublishTarget,
} from '~/composables/useDesktopSettings';
import {
  cancelIncompleteHsdataPublishBatch,
  formatHsdataDate,
  getHsdataErrorMessage,
  getIncompletePublishBatch,
  type HsdataPublishStreamInput,
  listenHsdataPublishProgress,
  listPublishBatches,
  publishCurrentHsdataToRemote,
  publishSingleCard,
  reanchorCurrentHsdataPublishBaseline,
  stopHsdataPublishJob,
} from '~/composables/useHsdataRepo';
import type {
  HsdataPublishReport,
  HsdataSingleCardPublishReport,
  PublishJobProgressEvent,
} from '~/composables/useHsdataRepo';

definePageMeta({
  layout: 'admin',
  title: '发布',
});

const publishTypes = [
  { label: '卡牌数据 (card_data)', value: 'card_data' },
];
const publishTarget = 'hearthstone' as const;

const toast = useToast();
const publishTargets = ref<DesktopPublishTarget[]>([]);
const selectedEnvironment = ref('');
const publishTargetError = ref('');
const publishError = ref('');
const publishing = ref(false);
const stoppingPublish = ref(false);
const publishResult = ref<HsdataPublishReport | null>(null);
const publishProgress = ref<PublishJobProgressEvent | null>(null);
const incompleteBatch = ref<(HsdataPublishReport & { pendingRowCount?: number }) | null>(null);
const batchListLoading = ref(false);
const batchList = ref<HsdataPublishReport[]>([]);
const cancelingBatchId = ref('');
const publishType = ref('card_data');
const dryRun = ref(false);
const progressClockMs = ref(Date.now());
let progressTimer: ReturnType<typeof setInterval> | null = null;
let stopProgressListener: (() => void) | null = null;

// Single-card dev publish
const singleCardId = ref('');
const singleCardPublishing = ref(false);
const singleCardResult = ref<HsdataSingleCardPublishReport | null>(null);
const singleCardError = ref('');

const environmentItems = computed(() => {
  return publishTargets.value.map(target => ({
    label: target.environment,
    value: target.environment,
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

const canPublish = computed(() => {
  return hasPublishTarget.value && !publishing.value;
});

function formatPublishTargetFingerprint(fingerprint: string | null) {
  return fingerprint?.slice(0, 8) ?? '';
}

function formatPublishOperationKind(kind: string) {
  switch (kind) {
    case 'publish': return '发布';
    case 'reanchor': return '重建基线';
    case 'repair': return '修复';
    case 'rollback': return '回滚';
    default: return kind;
  }
}

function formatPublishType(type: string) {
  switch (type) {
    case 'card_data': return '卡牌数据';
    default: return type;
  }
}

function statusBadgeColor(status: string) {
  switch (status) {
    case 'completed': return 'success';
    case 'failed': return 'error';
    case 'stopped': return 'warning';
    default: return 'primary';
  }
}

function formatPublishStatus(status: string) {
  switch (status) {
    case 'planning': return '规划中';
    case 'applying': return '执行中';
    case 'paused': return '已暂停';
    case 'stopped': return '已停止';
    case 'completed': return '已完成';
    case 'failed': return '失败';
    default: return status;
  }
}

/** Returns whether one history row can be canceled from residual local database state. */
function isCancelableBatch(batch: HsdataPublishReport) {
  return batch.status === 'planning' || batch.status === 'applying';
}

const progressPercent = computed(() => {
  if (!publishProgress.value) return null;
  const phase = publishProgress.value.phase;
  if (phase === 'completed' || phase === 'failed' || phase === 'stopped') return null;
  const total = publishProgress.value.totalRowCount;
  const completed = publishProgress.value.completedRowCount;
  if (total == null || total === 0) return null;
  return (completed ?? 0) / total * 100;
});

const phaseLabel = computed(() => {
  if (!publishProgress.value) return '';
  const phase = publishProgress.value.phase;
  switch (phase) {
    case 'loading_snapshots': return '加载快照';
    case 'deriving_range': return '推导版本范围';
    case 'loading_baseline': return '加载基线';
    case 'building_diff': return '构建差异';
    case 'writing_batch': return '写入批次元数据';
    case 'writing_batch_rows': return '写入批次行';
    case 'applying_remote': return '应用远程';
    case 'finalizing': return '完成发布';
    case 'completed': return '发布完成';
    case 'failed': return '发布失败';
    default: return phase;
  }
});

const phaseColor = computed(() => {
  if (!publishProgress.value) return 'primary';
  const phase = publishProgress.value.phase;
  if (phase === 'completed') return 'success';
  if (phase === 'stopped') return 'warning';
  if (phase === 'failed') return 'error';
  return 'primary';
});

const canStopPublish = computed(() => {
  if (!publishing.value || stoppingPublish.value) {
    return false;
  }

  const phase = publishProgress.value?.phase;
  return phase !== 'stopped' && phase !== 'completed' && phase !== 'failed';
});

function startProgressTimer() {
  progressClockMs.value = Date.now();
  progressTimer = setInterval(() => {
    progressClockMs.value = Date.now();
  }, 500);
}

function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function formatElapsedDuration(startedAt: string | null | undefined, nowMs: number, finishedAt?: string | null) {
  if (!startedAt) return '-';
  const startedMs = new Date(startedAt).getTime();
  const endMs = finishedAt ? new Date(finishedAt).getTime() : nowMs;
  if (!Number.isFinite(startedMs) || !Number.isFinite(endMs)) return '-';
  const seconds = Math.max(0, Math.floor((endMs - startedMs) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationMs(durationMs: number | null | undefined) {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return '-';
  const seconds = Math.max(0, Math.floor(durationMs / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const estimatedTotalMs = computed(() => {
  const p = publishProgress.value;
  if (!p || p.phase === 'completed') return null;
  if (!p.phaseStartedAt) return null;
  const startedMs = new Date(p.phaseStartedAt).getTime();
  if (!Number.isFinite(startedMs)) return null;
  const elapsedMs = Math.max(0, progressClockMs.value - startedMs);
  const total = p.totalRowCount ?? null;
  const completed = p.completedRowCount ?? null;
  if (total == null || completed == null || total <= 0 || completed <= 0 || completed >= total) return null;
  if (elapsedMs < 2000) return null;
  const ratio = completed / total;
  if (ratio < 0.02) return null;
  return Math.round(elapsedMs / ratio);
});

const progressTimeLabel = computed(() => {
  const p = publishProgress.value;
  const elapsed = formatElapsedDuration(p?.startedAt, progressClockMs.value, p?.finishedAt);
  const estimated = formatDurationMs(estimatedTotalMs.value);
  if (estimated === '-') return elapsed;
  return `${elapsed} / ${estimated}`;
});

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

async function submitPublish() {
  const stream = selectedPublishStream.value;

  if (!canPublish.value || !stream) return;

  publishing.value = true;
  publishError.value = '';
  publishResult.value = null;
  publishProgress.value = null;

  let terminalReached: (() => void) | null = null;
  const terminalSignal = new Promise<void>(resolve => { terminalReached = resolve; });

  stopProgressListener = listenHsdataPublishProgress((event) => {
    publishProgress.value = event;
    if (event.report) {
      publishResult.value = event.report;
    }
    if (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'stopped') {
      publishing.value = false;
      stopProgressTimer();
      terminalReached?.();
    }
  });
  startProgressTimer();

  try {
    const result = await publishCurrentHsdataToRemote({
      ...stream,
      dryRun: dryRun.value,
    });
    publishResult.value = result;
    toast.add({
      title: '发布已完成',
      description: `${result.publishTarget} / ${result.environment} / changed=${result.changedRowCount}`,
      color: 'success',
    });
  } catch (error) {
    console.error('Failed to publish hsdata projection to remote:', error);
    publishError.value = getHsdataErrorMessage(error);
    toast.add({
      title: '发布失败',
      description: publishError.value,
      color: 'error',
    });
  } finally {
    // Wait for the event stream to deliver the terminal event.
    // Falls back to 800ms timeout in case the stream event is lost.
    await Promise.race([
      terminalSignal,
      new Promise(resolve => setTimeout(resolve, 800)),
    ]);
    publishing.value = false;
    stoppingPublish.value = false;
    stopProgressTimer();
    stopProgressListener?.();
    stopProgressListener = null;
    await refreshPublishState();
  }
}

async function submitReanchor() {
  const stream = selectedPublishStream.value;

  if (!canPublish.value || !stream) return;

  publishing.value = true;
  publishError.value = '';
  publishResult.value = null;
  publishProgress.value = null;

  let terminalReached: (() => void) | null = null;
  const terminalSignal = new Promise<void>(resolve => { terminalReached = resolve; });

  stopProgressListener = listenHsdataPublishProgress((event) => {
    publishProgress.value = event;
    if (event.report) {
      publishResult.value = event.report;
    }
    if (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'stopped') {
      publishing.value = false;
      stopProgressTimer();
      terminalReached?.();
    }
  });
  startProgressTimer();

  try {
    const result = await reanchorCurrentHsdataPublishBaseline(stream);
    publishResult.value = result;
    toast.add({
      title: '本地基线重建完成',
      description: `${result.publishTarget} / ${result.environment} / rows=${result.totalRowCount}`,
      color: 'success',
    });
  } catch (error) {
    console.error('Failed to reanchor local hsdata publish baseline:', error);
    publishError.value = getHsdataErrorMessage(error);
    toast.add({
      title: '本地基线重建失败',
      description: publishError.value,
      color: 'error',
    });
  } finally {
    await Promise.race([
      terminalSignal,
      new Promise(resolve => setTimeout(resolve, 800)),
    ]);
    publishing.value = false;
    stoppingPublish.value = false;
    stopProgressTimer();
    stopProgressListener?.();
    stopProgressListener = null;
    await refreshPublishState();
  }
}

async function stopCurrentPublish() {
  if (!canStopPublish.value) return;

  stoppingPublish.value = true;

  try {
    await stopHsdataPublishJob();
  } catch (error) {
    console.error('Failed to stop publish job:', error);
    publishError.value = getHsdataErrorMessage(error);
    toast.add({
      title: '停止失败',
      description: publishError.value,
      color: 'error',
    });
  } finally {
    if (publishProgress.value?.phase === 'completed' || publishProgress.value?.phase === 'failed' || publishProgress.value?.phase === 'stopped') {
      stoppingPublish.value = false;
    }
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

    if (publishProgress.value?.batchId === batch.batchId) {
      publishProgress.value = null;
      publishing.value = false;
      stoppingPublish.value = false;
      stopProgressTimer();
      stopProgressListener?.();
      stopProgressListener = null;
    }

    if (incompleteBatch.value?.batchId === batch.batchId) {
      incompleteBatch.value = null;
    }

    publishResult.value = result;
    publishError.value = '';
    toast.add({
      title: '批次已取消',
      description: `${result.batchId} 已标记为已停止`,
      color: 'success',
    });
    await refreshPublishState();
  } catch (error) {
    console.error('Failed to cancel incomplete publish batch:', error);
    publishError.value = getHsdataErrorMessage(error);
    toast.add({
      title: '取消失败',
      description: publishError.value,
      color: 'error',
    });
  } finally {
    cancelingBatchId.value = '';
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
    batchList.value = await listPublishBatches(stream);
  } catch {
    batchList.value = [];
  } finally {
    batchListLoading.value = false;
  }
}

async function refreshPublishState() {
  await Promise.all([loadBatchList(), loadIncompleteBatch()]);
}

function reconnectPublishProgress() {
  const phase = publishProgress.value?.phase;

  publishing.value = phase !== 'completed' && phase !== 'failed' && phase !== 'stopped';
  publishError.value = '';
  publishResult.value = null;

  stopProgressListener = listenHsdataPublishProgress((event) => {
    publishProgress.value = event;
    if (event.report) {
      publishResult.value = event.report;
    }
    if (event.phase === 'completed' || event.phase === 'failed' || event.phase === 'stopped') {
      publishing.value = false;
      stoppingPublish.value = false;
      stopProgressTimer();
      void refreshPublishState();
    }
  });
  startProgressTimer();
}

const PUBLISH_PAGE_STATE_KEY = 'console-desktop-hearthstone-publish-page';

interface PublishPageState {
  dryRun: boolean;
  environment: string;
}

function persistPublishPageState() {
  const state: PublishPageState = {
    dryRun: dryRun.value,
    environment: selectedEnvironment.value,
  };
  window.localStorage.setItem(PUBLISH_PAGE_STATE_KEY, JSON.stringify(state));
}

function normalizePublishPageState(raw: Partial<PublishPageState>): PublishPageState {
  return {
    dryRun: typeof raw.dryRun === 'boolean' ? raw.dryRun : false,
    environment: typeof raw.environment === 'string' ? raw.environment : '',
  };
}

function restorePublishPageState() {
  try {
    const raw = window.localStorage.getItem(PUBLISH_PAGE_STATE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const state = normalizePublishPageState(parsed);
    dryRun.value = state.dryRun;
    selectedEnvironment.value = state.environment;
  } catch {
    window.localStorage.removeItem(PUBLISH_PAGE_STATE_KEY);
  }
}

watch([dryRun, selectedEnvironment], () => {
  persistPublishPageState();
});

watch(selectedPublishStream, async () => {
  publishError.value = '';
  publishResult.value = null;
  singleCardError.value = '';
  singleCardResult.value = null;
  await refreshPublishState();
});

onMounted(async () => {
  restorePublishPageState();
  await loadPublishTarget();
  await refreshPublishState();

  // If there's an active publish job, reconnect the progress listener
  if (incompleteBatch.value) {
    reconnectPublishProgress();
  }
});

onBeforeUnmount(() => {
  stopProgressListener?.();
  stopProgressTimer();
  publishing.value = false;
});
</script>

<template>
  <div class="h-full space-y-4 overflow-y-auto p-4">
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
              :disabled="publishing || publishTargets.length === 0"
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
            :disabled="publishing"
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

    <UCard>
      <template #header>
        <span class="font-medium">发布操作</span>
      </template>

      <div class="space-y-4">
        <div class="max-w-xs">
          <div class="mb-1 text-xs text-muted">发布类型</div>
          <USelect
            v-model="publishType"
            :items="publishTypes"
            :disabled="publishing"
            option-attribute="label"
          />
        </div>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="dryRun" type="checkbox" :disabled="publishing">
          Dry Run（仅分析差异，不实际写入）
        </label>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="发布当前本地投影"
            icon="i-lucide-upload"
            :loading="publishing"
            :disabled="!canPublish"
            @click="submitPublish"
          />
          <UButton
            label="重建本地基线"
            icon="i-lucide-anchor"
            color="warning"
            variant="soft"
            :loading="publishing"
            :disabled="!canPublish"
            @click="submitReanchor"
          />
          <UButton
            label="停止"
            icon="i-lucide-square"
            color="error"
            variant="soft"
            :loading="stoppingPublish"
            :disabled="!canStopPublish"
            @click="stopCurrentPublish"
          />
        </div>

        <UAlert
          v-if="publishError.length > 0"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="publishError"
        />

        <div
          v-if="publishing || publishProgress"
          class="rounded-lg border border-default p-4"
        >
          <div class="mb-3 flex items-center justify-between">
            <UBadge
              :label="phaseLabel"
              :color="phaseColor"
              variant="soft"
            />
            <span class="text-xs text-muted">{{ progressTimeLabel }}</span>
          </div>

          <UProgress
            :model-value="progressPercent"
            :color="phaseColor"
            :animation="publishing ? 'carousel' : 'swing'"
            size="md"
          />

          <div
            v-if="publishProgress?.message"
            class="mt-2 text-sm text-muted"
          >
            {{ publishProgress.message }}
          </div>

          <div
            v-if="publishProgress?.totalRowCount && publishProgress.totalRowCount > 0"
            class="mt-1 text-xs text-muted"
          >
            {{ publishProgress.completedRowCount ?? 0 }} / {{ publishProgress.totalRowCount }} 行
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="publishResult">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-medium">发布报告</span>
          <UBadge
            v-if="publishResult.status === 'dry_run'"
            label="Dry Run"
            color="warning"
            variant="soft"
          />
          <UBadge
            v-else
            label="Success"
            color="success"
            variant="soft"
          />
        </div>
      </template>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">批次</div>
          <div class="mt-1 break-all font-mono text-sm">
            {{ publishResult.batchId }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">Manifest</div>
          <div class="mt-1 break-all font-mono text-sm">
            {{ publishResult.manifestHash }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">操作</div>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <UBadge
              :label="formatPublishOperationKind(publishResult.operationKind)"
              color="primary"
              variant="soft"
              size="xs"
            />
            <UBadge
              :label="formatPublishType(publishResult.publishType)"
              color="neutral"
              variant="soft"
              size="xs"
            />
            <UBadge
              :label="formatPublishStatus(publishResult.status)"
              :color="statusBadgeColor(publishResult.status)"
              variant="soft"
              size="xs"
            />
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">变化统计</div>
          <div class="mt-1 font-mono text-sm">
            {{ publishResult.changedRowCount }} / {{ publishResult.totalRowCount }}
          </div>
          <div class="mt-1 text-xs text-muted">
            +{{ publishResult.insertedRowCount }}
            ~{{ publishResult.updatedRowCount }}
            -{{ publishResult.deletedRowCount }}
            ={{ publishResult.unchangedRowCount }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">发布时间</div>
          <div class="mt-1 break-all font-mono text-sm">
            {{ formatHsdataDate(publishResult.publishedAt) }}
          </div>
        </div>
        <div class="rounded-lg border border-default p-3 sm:col-span-2">
          <div class="text-xs text-muted">分表统计</div>
          <div class="mt-1 grid grid-cols-4 gap-2 text-sm">
            <div>
              <span class="text-muted">Cards</span>
              <span class="ml-1 font-mono">{{ publishResult.cardRowCount }}</span>
            </div>
            <div>
              <span class="text-muted">Entities</span>
              <span class="ml-1 font-mono">{{ publishResult.entityRowCount }}</span>
            </div>
            <div>
              <span class="text-muted">Localizations</span>
              <span class="ml-1 font-mono">{{ publishResult.localizationRowCount }}</span>
            </div>
            <div>
              <span class="text-muted">Relations</span>
              <span class="ml-1 font-mono">{{ publishResult.relationRowCount }}</span>
            </div>
          </div>
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
                <UButton
                  v-if="isCancelableBatch(batch)"
                  label="取消"
                  icon="i-lucide-x"
                  color="error"
                  variant="soft"
                  size="xs"
                  :loading="cancelingBatchId === batch.batchId"
                  :disabled="cancelingBatchId.length > 0"
                  @click="cancelBatch(batch)"
                />
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
  </div>
</template>
