<template>
  <div class="desktop-page space-y-4 p-4">
    <UCard>
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-cloud-upload" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">推送</h1>
          </div>
          <p class="mt-1 text-sm text-muted">将本地 pending_push 的 commits 推送到远端数据库。</p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <span class="font-medium">推送操作</span>
      </template>

      <div class="space-y-4">
        <UAlert
          v-if="incompleteBatch"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
        >
          <template #title>检测到未完成的推送</template>
          <template #description>
            批次 {{ incompleteBatch.id }}（{{ incompleteBatch.stream }}）于 {{ formatTime(incompleteBatch.startedAt) }} 启动后未完成。
            推送时将在上次中断的位置继续。
          </template>
        </UAlert>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="开始推送"
            icon="i-lucide-cloud-upload"
            :loading="isRunning"
            :disabled="isRunning"
            @click="startPush"
          />
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="error"
        />

        <div
          v-if="isRunning || progress"
          class="rounded-lg border border-default p-4"
        >
          <div class="mb-3 flex items-center justify-between">
            <UBadge
              :label="phaseLabel"
              :color="phaseColor"
              variant="soft"
            />
            <span class="text-xs text-muted">{{ elapsedText }}</span>
          </div>

          <UProgress
            :model-value="progressPercent"
            :color="phaseColor"
            animation="carousel"
            size="md"
          />

          <div
            v-if="progress?.message"
            class="mt-2 text-sm text-muted"
          >
            {{ progress.message }}
          </div>

          <div
            v-if="progress?.totalCount && progress.totalCount > 0"
            class="mt-1 text-xs text-muted"
          >
            {{ progress.completedCount ?? 0 }} / {{ progress.totalCount }} 条
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="pushResult">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-medium">推送报告</span>
          <UBadge
            :label="pushResult.blockedReason ? '受阻' : '完成'"
            :color="pushResult.blockedReason ? 'warning' : 'success'"
            variant="soft"
            size="xs"
          />
        </div>
      </template>

      <div class="space-y-4">
        <UAlert
          v-if="pushResult.blockedReason"
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
        >
          <template #title>被阻止于 {{ pushResult.blockedReason }}</template>
          <template #description>{{ pushResult.blockedMessage }}</template>
        </UAlert>

        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">已推送</div>
            <div class="mt-1 font-mono text-lg font-semibold">{{ pushResult.pushed.length }}</div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">已应用</div>
            <div class="mt-1 font-mono text-lg font-semibold text-success">{{ appliedCount }}</div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">重复</div>
            <div class="mt-1 font-mono text-lg font-semibold text-muted">{{ duplicateCount }}</div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">时间</div>
            <div class="mt-1 font-mono text-sm">{{ finishedAt }}</div>
          </div>
        </div>

        <table v-if="pushResult.pushed.length > 0" class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-xs text-muted">
              <th class="px-3 py-2 font-normal">Sequence</th>
              <th class="px-3 py-2 font-normal">状态</th>
              <th class="px-3 py-2 font-normal">Client Mutation ID</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in pushResult.pushed"
              :key="item.localSequence"
              class="border-b border-default"
            >
              <td class="px-3 py-2 font-mono text-xs">{{ item.localSequence }}</td>
              <td class="px-3 py-2">
                <UBadge
                  :label="item.status === 'applied' ? '已应用' : '重复'"
                  :color="item.status === 'applied' ? 'success' : 'neutral'"
                  variant="soft"
                  size="xs"
                />
              </td>
              <td class="max-w-64 truncate px-3 py-2 font-mono text-xs text-muted">
                {{ item.clientMutationId }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UCard v-if="history.length > 0">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">推送历史</span>
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="historyLoading"
            @click="loadHistory"
          />
        </div>
      </template>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-xs text-muted">
              <th class="px-3 py-2 font-normal">状态</th>
              <th class="px-3 py-2 font-normal">已推送</th>
              <th class="px-3 py-2 font-normal">重复</th>
              <th class="px-3 py-2 font-normal">被阻原因</th>
              <th class="px-3 py-2 font-normal">时间</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="batch in history"
              :key="batch.id"
              class="border-b border-default"
            >
              <td class="px-3 py-2">
                <UBadge
                  :label="batch.status === 'completed' ? '完成' : '失败'"
                  :color="batch.status === 'completed' ? 'success' : 'error'"
                  variant="soft"
                  size="xs"
                />
              </td>
              <td class="px-3 py-2 font-mono text-xs">{{ batch.pushedCount }}</td>
              <td class="px-3 py-2 font-mono text-xs text-muted">{{ batch.duplicateCount }}</td>
              <td class="px-3 py-2 max-w-48 truncate text-xs text-muted">
                {{ batch.blockedReason ? `${batch.blockedReason}: ${batch.blockedMessage}` : '-' }}
              </td>
              <td class="px-3 py-2 text-xs text-muted">{{ formatTime(batch.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { consumeEventIterator } from '@orpc/client';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';

interface PushBatchRow {
  id: string;
  stream: string;
  consumer: string;
  status: string;
  pushedCount: number;
  duplicateCount: number;
  blockedReason: string | null;
  blockedMessage: string | null;
  blockedSequence: number | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

definePageMeta({
  layout: 'admin',
  title:  '推送',
});

const client = useDesktopRuntimeClient();

const isRunning = ref(false);
const error = ref('');
const progress = ref<{
  phase: string;
  message: string;
  startedAt: string;
  finishedAt: string | null;
  totalCount: number | null;
  completedCount: number | null;
  pushed: Array<{ localSequence: number; clientMutationId: string; status: string }>;
  blockedReason: string | null;
  blockedMessage: string | null;
  blockedSequence: number | null;
} | null>(null);
const pushResult = ref<typeof progress.value>(null);
const history = ref<PushBatchRow[]>([]);
const historyLoading = ref(false);
const incompleteBatch = ref<{ id: string; stream: string; startedAt: string } | null>(null);
const clockMs = ref(Date.now());
let clockHandle: ReturnType<typeof setInterval> | null = null;
let stopStream: (() => void) | null = null;

const phaseLabel = computed(() => {
  switch (progress.value?.phase) {
    case 'pushing': return '正在推送';
    case 'completed': return '推送完成';
    case 'failed': return '推送失败';
    default: return progress.value?.phase ?? '';
  }
});

const phaseColor = computed(() => {
  if (progress.value?.phase === 'completed') return 'success';
  if (progress.value?.phase === 'failed') return 'error';
  return 'primary';
});

const progressPercent = computed(() => {
  const total = progress.value?.totalCount;
  const completed = progress.value?.completedCount;
  if (total == null || total === 0 || completed == null) return null;
  return (completed / total) * 100;
});

const elapsedSeconds = computed(() => {
  const started = progress.value?.startedAt;
  if (!started) return 0;
  return Math.max(0, Math.floor((clockMs.value - new Date(started).getTime()) / 1000));
});

const elapsedText = computed(() => {
  const secs = elapsedSeconds.value;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
});

const appliedCount = computed(() =>
  pushResult.value?.pushed.filter(p => p.status === 'applied').length ?? 0,
);

const duplicateCount = computed(() =>
  pushResult.value?.pushed.filter(p => p.status === 'duplicate').length ?? 0,
);

const finishedAt = computed(() => {
  const t = pushResult.value?.finishedAt;
  if (!t) return '-';
  return new Date(t).toLocaleTimeString();
});

function startClock() {
  stopClock();
  clockMs.value = Date.now();
  clockHandle = setInterval(() => { clockMs.value = Date.now(); }, 500);
}

function stopClock() {
  if (clockHandle != null) { clearInterval(clockHandle); clockHandle = null; }
}

async function startPush() {
  isRunning.value = true;
  error.value = '';
  progress.value = null;
  pushResult.value = null;
  stopStream?.();
  startClock();

  try {
    await client.tag.pushToRemoteWithProgress({});
    stopStream = consumeEventIterator(client.tag.watchPushProgress(), {
      onEvent: (event) => {
        progress.value = {
          phase: event.phase,
          message: event.message,
          startedAt: event.startedAt,
          finishedAt: event.finishedAt,
          totalCount: event.totalCount,
          completedCount: event.completedCount,
          pushed: event.pushed,
          blockedReason: event.blockedReason,
          blockedMessage: event.blockedMessage,
          blockedSequence: event.blockedSequence,
        };
      },
      onDone: () => {
        pushResult.value = progress.value;
        isRunning.value = false;
        stopClock();
        incompleteBatch.value = null;
        void loadHistory();
      },
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    isRunning.value = false;
    stopClock();
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString();
}

async function loadHistory() {
  historyLoading.value = true;
  try {
    history.value = await client.tag.listPushBatches();
  } catch {
    // no-op
  } finally {
    historyLoading.value = false;
  }
}

async function checkIncomplete() {
  try {
    incompleteBatch.value = await client.tag.getIncompletePushBatch();
  } catch {
    // no-op
  }
}

onMounted(() => {
  void loadHistory();
  void checkIncomplete();
});

onUnmounted(() => {
  stopStream?.();
  stopClock();
});
</script>
