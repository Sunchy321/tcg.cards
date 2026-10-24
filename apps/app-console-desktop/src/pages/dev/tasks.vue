<template>
  <div class="mx-auto max-w-3xl space-y-5">
    <h2 class="text-xl font-semibold">测试任务</h2>
    <p class="text-sm text-gray-500 dark:text-gray-400">运行一个短任务，检查进度和完成状态。</p>
    <UButton :loading="starting" :disabled="starting" @click="void start()">运行测试任务</UButton>
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
    <TaskItem v-if="current" :task="current" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' });
const { tasks, accepted } = useTasks();
const taskRunId = ref<string | null>(null);
const starting = ref(false);
const error = ref('');
const current = computed(() => taskRunId.value ? tasks.value[taskRunId.value] : null);

/** Starts the isolated development task through the same bridge as business tasks. */
async function start(): Promise<void> {
  starting.value = true;
  error.value = '';
  try {
    const result = await window.desktop.tasks.start('dev_sample', {});
    taskRunId.value = result.taskRunId;
    accepted(result.taskRunId);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法启动任务';
  } finally {
    starting.value = false;
  }
}
</script>
