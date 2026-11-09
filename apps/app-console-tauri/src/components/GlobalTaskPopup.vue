<template>
  <TaskPopup
    :tasks="taskEvents"
    :count="activeTaskCount"
    @pause="handlePause"
    @resume="handleResume"
    @cancel="handleCancel"
    @retry="handleRetry"
  />
</template>

<script setup lang="ts">
import { orpc } from '~/lib/orpc';

const { taskEvents, activeTaskCount, register: registerTask } = useTaskRegistry();

async function handlePause(_taskRunId: string) {
  // Pause is not exposed as a generic endpoint yet
}

async function handleResume(_taskRunId: string) {
  // Resume is not exposed as a generic endpoint yet
}

async function handleCancel(taskRunId: string) {
  await orpc.task.cancel({ taskRunId });
}

async function handleRetry(taskRunId: string) {
  const result = await orpc.task.retry({ taskRunId }) as any;
  if (result?.pageTask?.kind === 'attached') {
    registerTask(result);
  }
}
</script>
