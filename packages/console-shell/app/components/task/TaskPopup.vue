<template>
  <div>
    <!-- Trigger button -->
    <UButton
      size="sm"
      variant="ghost"
      icon="i-lucide-list-todo"
      :badge="count > 0 ? count : undefined"
      :color="count > 0 ? 'primary' : 'gray'"
      @click="open = !open"
    />

    <!-- Slide-over panel -->
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex justify-end"
    >
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/30" @click="open = false" />

      <!-- Panel -->
      <div class="relative w-96 max-w-full bg-white dark:bg-gray-900 shadow-xl flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">
            任务
          </h2>
          <UButton
            size="xs"
            variant="ghost"
            icon="i-heroicons-x-mark"
            @click="open = false"
          />
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div v-if="tasks.length === 0" class="text-center text-gray-400 dark:text-gray-500 py-12 text-sm">
            暂无活跃任务
          </div>

          <div v-for="task in tasks" :key="task.pageTask.kind === 'attached' ? task.pageTask.taskRunId : undefined">
            <TaskCard
              v-if="task.pageTask.kind === 'attached'"
              :title="statusLabel(task.pageTask.status)"
              :page-task="task.pageTask"
              :stages="task.stages"
              @pause="handlePause"
              @resume="handleResume"
              @cancel="handleCancel"
              @retry="handleRetry"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageEvent } from '@tcg-cards/model/src/task';

const open = ref(false);

const props = defineProps<{
  tasks: TaskPageEvent[];
  count: number;
}>();

const emit = defineEmits<{
  (e: 'pause', taskRunId: string): void;
  (e: 'resume', taskRunId: string): void;
  (e: 'cancel', taskRunId: string): void;
  (e: 'retry', taskRunId: string): void;
}>();

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '等待中',
    running: '运行中',
    pausing: '暂停中',
    paused: '已暂停',
    resuming: '恢复中',
    canceling: '取消中',
    canceled: '已取消',
    failed: '失败',
    completed: '已完成',
    abandoned: '已废弃',
  };
  return labels[status] ?? status;
}

function handlePause(taskRunId: string) { emit('pause', taskRunId); }
function handleResume(taskRunId: string) { emit('resume', taskRunId); }
function handleCancel(taskRunId: string) { emit('cancel', taskRunId); }
function handleRetry(taskRunId: string) { emit('retry', taskRunId); }
</script>
