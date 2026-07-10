<template>
  <UCard class="w-full">
    <template #header>
      <div class="flex items-center gap-3">
        <span class="text-base font-medium truncate">{{ title }}</span>
        <span
          v-if="statusLabel"
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          :class="statusColor"
        >
          <span class="size-1.5 rounded-full bg-current" />
          {{ statusLabel }}
        </span>
        <div class="ml-auto flex items-center gap-2">
          <slot name="title" />
        </div>
      </div>
    </template>

    <div v-if="hasDefaultSlot" class="mb-6">
      <slot />
    </div>

    <!-- Idle -->
    <div v-if="isIdle" class="py-3">
      <div class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="lucide:circle" class="size-3" />
        <span>暂无运行中的任务</span>
      </div>
    </div>

    <!-- Blocking -->
    <div v-else-if="blockingTask" class="py-3">
      <div class="flex items-center gap-2 text-sm text-warning">
        <UIcon name="lucide:alert-triangle" class="size-4" />
        <span>
          被
          <strong>{{ blockingTask.taskScopeSnapshot?.publishTarget ?? blockingTask.taskScopeType }} / {{ blockingTask.taskScopeSnapshot?.environment ?? blockingTask.taskScopeKey }}</strong>
          阻塞（{{ blockingTask.status }}）
        </span>
      </div>
      <div class="mt-2">
        <UButton
          v-if="blockingTask.canCancel"
          size="xs"
          color="neutral"
          variant="soft"
          @click="emit('cancel')"
        >
          <UIcon name="lucide:square" class="size-3.5" />
          取消阻塞任务
        </UButton>
      </div>
    </div>

    <!-- Attached -->
    <template v-else-if="run">
      <!-- Progress row -->
      <div class="rounded-lg border border-default">
        <TaskProgressBar
          :stage="currentStage"
          :status="run.status"
          :time-label="rightInfo"
        />
      </div>

      <!-- Steps row -->
      <TaskStepIndicator
        :stages="stages"
        :current-stage-key="run.currentStageKey"
        :status="run.status"
        class="px-4 py-2"
      />

      <!-- Terminal message: failed / canceled / abandoned -->
      <div
        v-if="errorText"
        class="rounded-md px-3 py-2 text-sm"
        :class="errorBannerClass"
      >
        {{ errorText }}
      </div>
    </template>

    <template #footer>
        <TaskActionBar
          :can-pause="run?.canPause ?? false"
          :can-resume="run?.canResume ?? false"
          :can-cancel="run?.canCancel ?? false"
          :is-terminal="isTerminal"
          :is-blocking="false"
          @pause="emit('pause')"
          @resume="emit('resume')"
          @cancel="emit('cancel')"
          @retry="emit('retry')"
        >
          <template #actions>
            <slot name="actions" />
          </template>
        </TaskActionBar>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { TaskPageTask, TaskStage } from '@tcg-cards/model/src/task';
import { useToast } from '@nuxt/ui/composables';

type BlockingPageTask = Extract<TaskPageTask, { kind: 'blocking' }>;

const props = defineProps<{
  title:             string;
  activeScopeLabel?: string;
  pageTask:          TaskPageTask;
  stages:            TaskStage[];
}>();

const emit = defineEmits<{
  pause:  [];
  resume: [];
  cancel: [];
  retry:  [];
}>();

const slots = useSlots();
const hasDefaultSlot = computed(() => !!slots.default);

const clock = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  clockTimer = setInterval(() => {
    clock.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer);
  }
});

const isIdle = computed(() => props.pageTask.kind === 'idle');

const blockingTask = computed<BlockingPageTask | null>(() => {
  if (props.pageTask.kind === 'blocking') return props.pageTask;
  return null;
});

const run = computed(() => {
  if (props.pageTask.kind === 'attached') return props.pageTask;
  return null;
});

const currentStage = computed(() => {
  if (!run.value) return null;
  return props.stages.find(s => s.stageKey === run.value!.currentStageKey) ?? null;
});

const isTerminal = computed(() => {
  if (!run.value) return false;
  return ['completed', 'failed', 'canceled', 'abandoned'].includes(run.value.status);
});

type StatusMeta = { label: string, color: string };

const statusMeta = computed<StatusMeta>(() => {
  const status = run.value?.status ?? 'idle';
  const map: Record<string, StatusMeta> = {
    idle:      { label: '', color: '' },
    pending:   { label: 'pending', color: 'bg-muted text-muted' },
    running:   { label: 'running', color: 'bg-primary/10 text-primary' },
    pausing:   { label: 'pausing', color: 'bg-warning/10 text-warning' },
    paused:    { label: 'paused', color: 'bg-warning/10 text-warning' },
    resuming:  { label: 'resuming', color: 'bg-warning/10 text-warning' },
    canceling: { label: 'canceling', color: 'bg-warning/10 text-warning' },
    completed: { label: 'completed', color: 'bg-success/10 text-success' },
    failed:    { label: 'failed', color: 'bg-error/10 text-error' },
    canceled:  { label: 'canceled', color: 'bg-muted text-muted' },
    abandoned: { label: 'abandoned', color: 'bg-muted text-muted' },
  };
  return map[status] ?? map.idle!;
});

const statusLabel = computed(() => statusMeta.value.label);
const statusColor = computed(() => statusMeta.value.color);

const errorText = computed(() => {
  if (!run.value) return null;
  if (run.value.status === 'failed') return run.value.errorMessage || '任务执行失败';
  if (run.value.status === 'canceled') return run.value.terminalReason === 'manual_cancel' ? '已取消' : `已取消（${run.value.terminalReason ?? 'system_cancel'}）`;
  if (run.value.status === 'abandoned') return run.value.terminalReason === 'abandoned_stale_run' ? '已放弃（服务重启）' : `已放弃（${run.value.terminalReason ?? 'unknown'}）`;
  return null;
});

const errorBannerClass = computed(() => {
  if (run.value?.status === 'failed') return 'bg-error/5 text-error';
  return 'bg-warning/5 text-warning';
});

const toast = useToast();

watch(() => run.value?.status, (status, prev) => {
  if (status === 'failed' && prev && prev !== 'failed') {
    toast.add({ title: '任务失败', description: errorText.value ?? '', color: 'error' });
  }
});

const rightInfo = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  clock.value; // reactive tick
  if (blockingTask.value) return '';
  const task = run.value;
  if (!task?.startedAt) return '';
  const startedMs = new Date(task.startedAt).getTime();
  if (!Number.isFinite(startedMs)) return '';
  const endMs = task.finishedAt ? new Date(task.finishedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((endMs - startedMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `总计 ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
});
</script>
