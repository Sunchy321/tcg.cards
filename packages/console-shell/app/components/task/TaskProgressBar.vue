<template>
  <div class="px-4 py-2">
    <div v-if="timeLabel || leftText" class="flex items-center justify-between">
      <span class="text-xs text-muted truncate">{{ leftText }}</span>
      <span v-if="timeLabel" class="text-xs text-muted tabular-nums ml-2 shrink-0">{{ timeLabel }}</span>
    </div>
    <!-- Multi-segment progress bar -->
    <div
      v-if="stage?.segments && stage.segments.length > 0"
      class="h-1.5 mt-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex"
    >
      <div
        v-for="(seg, segIdx) in stage.segments"
        :key="seg.name"
        class="h-full transition-all duration-500 ease-out first:rounded-l-full last:rounded-r-full"
        :class="segmentColor(segIdx)"
        :style="{ width: segmentsTotal > 0 ? `${seg.total / segmentsTotal * 100}%` : '0%' }"
      >
        <div
          class="h-full transition-all duration-500 ease-out"
          :style="{ width: seg.total > 0 ? `${Math.min(seg.done / seg.total * 100, 100)}%` : '0%' }"
        />
      </div>
    </div>
    <!-- Single progress bar (fallback) -->
    <div
      v-else-if="stage && stage.progressMode === 'bounded' && stage.total"
      class="h-1.5 mt-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
    >
      <div
        class="h-full rounded-full transition-all duration-500 ease-out"
        :class="progressColor"
        :style="{ width: `${Math.min(progress ?? 0, 100)}%` }"
      />
    </div>
    <div
      v-else-if="stage && stage.progressMode === 'unbound'"
      class="h-1.5 mt-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
    >
      <div class="h-full rounded-full bg-primary animate-pulse w-1/3" />
    </div>
    <!-- Counters row -->
    <div v-if="rightText || stage?.segments || stageTimeText" class="flex items-center justify-between mt-1 flex-wrap gap-x-4">
      <div v-if="rightText || stage?.segments" class="flex items-center gap-3 text-xs text-muted">
        <span v-if="rightText" class="tabular-nums">{{ rightText }}</span>
        <template v-if="stage?.segments">
          <span
            v-for="(seg, segIdx) in stage.segments"
            :key="seg.name"
            class="inline-flex items-center gap-1"
          >
            <span class="size-2 rounded-full" :class="segmentColor(segIdx)" />
            {{ seg.name }} {{ seg.done }}/{{ seg.total }}
          </span>
        </template>
      </div>
      <span v-if="stageTimeText" class="text-xs text-muted tabular-nums">{{ stageTimeText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskStage } from '@tcg-cards/model/src/task';

const props = defineProps<{
  stage:      TaskStage | null;
  status:     string;
  timeLabel?: string;
}>();

const clock = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  clockTimer = setInterval(() => {
    clock.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
});

const progress = computed(() => {
  if (!props.stage || props.stage.progressMode !== 'bounded' || props.stage.total == null || props.stage.total <= 0) {
    return null;
  }
  return Math.round((props.stage.done ?? 0) / props.stage.total * 100);
});

const leftText = computed(() => {
  if (props.status === 'idle') return '暂无运行中的任务';
  if (props.status === 'pending') return '等待启动中…';
  if (props.status === 'pausing') return '正在暂停…';
  if (props.status === 'resuming') return '正在恢复…';
  if (props.status === 'canceling') return '正在取消…';
  if (props.status === 'completed') return '全部阶段已完成';
  if (props.status === 'failed') return props.stage?.label ?? '执行失败';
  if (props.status === 'canceled') return '任务已取消';
  if (props.status === 'abandoned') return '任务已终止';
  return props.stage?.label ?? '';
});

const rightText = computed(() => {
  if (!props.stage || props.stage.progressMode !== 'bounded' || !props.stage.total) return '';
  if (props.status === 'paused') return `${props.stage.done ?? 0} / ${props.stage.total}`;
  if (props.status === 'completed') return `${props.stage.total} / ${props.stage.total}  100%`;
  if (props.status === 'failed' || props.status === 'canceled') return `${props.stage.done ?? 0} / ${props.stage.total}  ${Math.round((props.stage.done ?? 0) / props.stage.total * 100)}%`;
  if (props.status === 'running') {
    const pct = progress.value;
    if (pct != null) return `${props.stage.done ?? 0} / ${props.stage.total}  ${pct}%`;
    return `${props.stage.done ?? 0} / ${props.stage.total}`;
  }
  return `${props.stage.done ?? 0} / ${props.stage.total}`;
});

const stageTimeText = computed(() => {
  clock.value; // reactive tick
  if (!props.stage?.startedAt) return '';
  const startedMs = new Date(props.stage.startedAt).getTime();
  if (!Number.isFinite(startedMs)) return '';
  const nowMs = props.stage.finishedAt ? new Date(props.stage.finishedAt).getTime() : Date.now();
  const elapsed = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const elapsedStr = formatTime(elapsed);

  if (props.status === 'completed' || props.status === 'failed' || props.status === 'canceled') {
    return elapsedStr;
  }

  if (props.status === 'paused') {
    return `暂停于 ${elapsedStr}`;
  }

  if (props.status === 'running' && progress.value != null && progress.value > 0) {
    const remaining = Math.round(elapsed / progress.value * (100 - progress.value));
    return `${elapsedStr} · 剩余 ${formatTime(remaining)}`;
  }

  return elapsedStr;
});

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const segmentsTotal = computed(() => {
  if (!props.stage?.segments) return 0;
  return props.stage.segments.reduce((s, seg) => s + seg.total, 0);
});

const segmentColors = [
  'bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500',
  'bg-pink-500', 'bg-teal-500', 'bg-red-500', 'bg-indigo-500',
];

function segmentColor(index: number): string {
  return segmentColors[index % segmentColors.length]!;
}

const progressColor = computed(() => {
  if (['completed'].includes(props.status)) return 'bg-success';
  if (['failed', 'canceled', 'abandoned', 'pausing', 'canceling'].includes(props.status)) return 'bg-muted';
  return 'bg-primary';
});
</script>
