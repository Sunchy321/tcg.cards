<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { getDesktopHearthstonePublishTarget } from '~/composables/useDesktopSettings';
import {
  formatHsdataDate,
  getHsdataErrorMessage,
  getIncompletePublishBatch,
  listenHsdataPublishProgress,
  listPublishBatches,
  publishCurrentHsdataToRemote,
} from '~/composables/useHsdataRepo';
import type {
  HsdataPublishReport,
  PublishJobProgressEvent,
} from '~/composables/useHsdataRepo';

definePageMeta({
  layout: 'admin',
  title: '发布',
});

const publishTypes = [
  { label: '卡牌数据 (card_data)', value: 'card_data' },
];

const toast = useToast();
const publishTargetId = ref<string | null>(null);
const publishTargetEnvironment = ref<string | null>(null);
const publishTargetFingerprint = ref<string | null>(null);
const publishTargetError = ref('');
const publishError = ref('');
const publishing = ref(false);
const publishResult = ref<HsdataPublishReport | null>(null);
const publishProgress = ref<PublishJobProgressEvent | null>(null);
const incompleteBatch = ref<(HsdataPublishReport & { pendingRowCount?: number }) | null>(null);
const batchListLoading = ref(false);
const batchList = ref<HsdataPublishReport[]>([]);
const publishType = ref('card_data');
const progressClockMs = ref(Date.now());
let progressTimer: ReturnType<typeof setInterval> | null = null;
let stopProgressListener: (() => void) | null = null;

const hasPublishTarget = computed(() => {
  return Boolean(
    publishTargetId.value
    && publishTargetEnvironment.value
    && publishTargetFingerprint.value,
  );
});

const canPublish = computed(() => {
  return hasPublishTarget.value && !publishing.value;
});

const progressPercent = computed(() => {
  if (!publishProgress.value) return null;
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
  if (phase === 'failed') return 'error';
  return 'primary';
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
    const target = await getDesktopHearthstonePublishTarget();
    publishTargetId.value = target.publishTargetId ?? null;
    publishTargetEnvironment.value = target.environment ?? null;
    publishTargetFingerprint.value = target.targetFingerprint ?? null;
  } catch (error) {
    console.error('Failed to load Hearthstone publish target:', error);
    publishTargetError.value = getHsdataErrorMessage(error);
    publishTargetId.value = null;
    publishTargetEnvironment.value = null;
    publishTargetFingerprint.value = null;
  }
}

async function submitPublish() {
  if (!canPublish.value) return;

  publishing.value = true;
  publishError.value = '';
  publishResult.value = null;
  publishProgress.value = null;

  stopProgressListener = listenHsdataPublishProgress((event) => {
    publishProgress.value = event;
    if (event.report) {
      publishResult.value = event.report;
    }
  });
  startProgressTimer();

  try {
    const result = await publishCurrentHsdataToRemote();
    publishResult.value = result;
    toast.add({
      title: '发布已完成',
      description: `${result.publishTargetId} / ${result.environment} / changed=${result.changedRowCount}`,
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
    publishing.value = false;
    stopProgressListener?.();
    stopProgressListener = null;
    stopProgressTimer();
  }
}

async function loadIncompleteBatch() {
  try {
    incompleteBatch.value = await getIncompletePublishBatch();
  } catch {
    incompleteBatch.value = null;
  }
}

async function loadBatchList() {
  batchListLoading.value = true;
  try {
    batchList.value = await listPublishBatches();
  } catch {
    batchList.value = [];
  } finally {
    batchListLoading.value = false;
  }
}

function reconnectPublishProgress() {
  publishing.value = true;
  publishError.value = '';
  publishResult.value = null;
  publishProgress.value = null;

  stopProgressListener = listenHsdataPublishProgress((event) => {
    publishProgress.value = event;
    if (event.report) {
      publishResult.value = event.report;
    }
    if (event.phase === 'completed' || event.phase === 'failed') {
      publishing.value = false;
      stopProgressTimer();
    }
  });
  startProgressTimer();
}

onMounted(async () => {
  await Promise.all([loadPublishTarget(), loadBatchList()]);
  await loadIncompleteBatch();

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
            <span class="text-muted">{{ publishTargetId }}</span>
            <span class="text-muted">·</span>
            <span class="text-muted">{{ publishTargetEnvironment }}</span>
            <UBadge :label="publishTargetFingerprint?.slice(0, 12) ?? ''" color="neutral" variant="soft" size="xs" />
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
        description="请在 设置 → Games → Hearthstone 中配置发布目标的连接信息。"
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

        <div class="flex flex-wrap gap-2">
          <UButton
            label="发布当前本地投影"
            icon="i-lucide-upload"
            :loading="publishing"
            :disabled="!canPublish"
            @click="submitPublish"
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
            animation="carousel"
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
          <UBadge label="Success" color="success" variant="soft" />
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
              <th class="px-3 py-2 font-normal">状态</th>
              <th class="px-3 py-2 font-normal">变化行数</th>
              <th class="px-3 py-2 font-normal">发布时间</th>
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
                <UBadge
                  :label="batch.status"
                  :color="batch.status === 'completed' ? 'success' : batch.status === 'failed' ? 'error' : 'warning'"
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
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>
