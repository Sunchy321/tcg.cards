<template>
  <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="font-medium">{{ task.label }}</p>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ statusLabel }}</p>
      </div>
      <UBadge :color="badgeColor" variant="soft">{{ badgeLabel }}</UBadge>
    </div>
    <div v-for="stage in task.stages" :key="stage.key" class="mt-4">
      <div class="flex justify-between text-sm">
        <span>{{ stage.label }}</span>
        <span v-if="stage.total !== null">{{ stage.done ?? 0 }} / {{ stage.total }}</span>
      </div>
      <UProgress v-if="stage.total !== null" class="mt-2" :model-value="stage.total > 0 ? ((stage.done ?? 0) / stage.total) * 100 : 0" />
    </div>
    <UAlert v-if="task.errorMessage" class="mt-4" color="error" variant="soft" :description="task.errorMessage" />
  </div>
</template>

<script setup lang="ts">
import type { TaskView, TaskStageView } from '../../electron/contract';

const props = defineProps<{ task: {
  label:        string;
  status:       string;
  phase:        TaskView['phase'];
  createdAt:    string;
  stages:       readonly Readonly<TaskStageView>[];
  errorMessage: string | null;
}; }>();

const clock = ref(Date.now());

let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  timer = setInterval(() => {
    clock.value = Date.now();
  }, 1_000);
});

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer);
  }
});

const waitingSeconds = computed(() => Math.max(0, Math.floor((clock.value - Date.parse(props.task.createdAt)) / 1_000)));

const statusTexts: Record<string, string> = {
  pending:     '等待开始',
  running:     '正在运行',
  pausing:     '正在暂停',
  paused:      '已暂停',
  resuming:    '正在继续',
  canceling:   '正在取消',
  canceled:    '已取消',
  failed:      '执行失败',
  completed:   '已完成',
  abandoned:   '已放弃',
  interrupted: '已中断，等待继续',
};

const badgeColor = computed(() => {
  if (props.task.status === 'failed') return 'error';
  if (props.task.status === 'completed') return 'success';
  if (['paused', 'pausing', 'canceling', 'resuming', 'interrupted'].includes(props.task.status)) return 'warning';
  if (['canceled', 'abandoned'].includes(props.task.status)) return 'neutral';
  return 'primary';
});

const badgeLabel = computed(() => statusTexts[props.task.status] ?? props.task.status);

const statusLabel = computed(() => {
  if (props.task.status === 'pending') {
    if (props.task.phase === 'saving') return `正在保存任务 · 已等待 ${waitingSeconds.value} 秒`;
    if (props.task.phase === 'loading') return `正在准备任务 · 已等待 ${waitingSeconds.value} 秒`;
    return `等待开始 · 已等待 ${waitingSeconds.value} 秒`;
  }
  if (props.task.status === 'paused' || props.task.status === 'interrupted') return `${statusTexts[props.task.status]}，可点击“继续”`;
  return statusTexts[props.task.status] ?? props.task.status;
});
</script>
