<template>
  <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="font-medium">{{ task.label }}</p>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ statusLabel }}</p>
      </div>
      <UBadge :color="task.status === 'failed' ? 'error' : task.status === 'completed' ? 'success' : 'primary'" variant="soft">
        {{ task.status === 'completed' ? '已完成' : task.status === 'failed' ? '失败' : '进行中' }}
      </UBadge>
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
const statusLabel = computed(() => {
  if (props.task.status === 'completed') return '已完成';
  if (props.task.status === 'failed') return '执行失败';
  if (props.task.status === 'running') return '正在运行';
  if (props.task.phase === 'saving') return `正在保存任务 · 已等待 ${waitingSeconds.value} 秒`;
  if (props.task.phase === 'loading') return `正在准备任务 · 已等待 ${waitingSeconds.value} 秒`;
  return `等待开始 · 已等待 ${waitingSeconds.value} 秒`;
});
</script>
