<template>
  <div class="mx-auto max-w-3xl space-y-5">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">当前任务</h2>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" @click="void refresh()">刷新</UButton>
    </div>
    <UAlert v-if="listError" color="error" variant="soft" :description="listError" />
    <p v-if="active.length === 0" class="text-sm text-gray-500 dark:text-gray-400">当前没有进行中的任务。</p>
    <TaskItem v-for="task in active" :key="task.id" :task="task" />
    <UButton v-if="isDevelopment" color="neutral" variant="link" to="/dev/tasks">打开测试任务</UButton>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' });

const { active, listError, refresh } = useTasks();

const isDevelopment = import.meta.dev;

onMounted(() => {
  void refresh();
});
</script>
