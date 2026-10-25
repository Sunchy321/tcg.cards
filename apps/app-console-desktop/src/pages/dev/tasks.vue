<template>
  <div class="mx-auto max-w-3xl space-y-5">
    <h2 class="text-xl font-semibold">测试任务</h2>
    <p class="text-sm text-gray-500 dark:text-gray-400">运行可控任务，检查同类型复用、控件占用与暂停、取消、重试。</p>

    <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div v-if="occupying" class="space-y-4">
        <TaskItem :task="occupying" />
        <div class="flex flex-wrap gap-2">
          <UButton v-if="occupying.status === 'running'" :loading="busy" @click="control(occupying, 'pause')">暂停</UButton>
          <UButton
            v-if="['paused', 'interrupted'].includes(occupying.status)"
            :loading="busy"
            @click="control(occupying, 'resume')"
          >
            继续
          </UButton>
          <UButton
            v-if="['pending', 'running', 'pausing', 'paused', 'resuming', 'interrupted'].includes(occupying.status)"
            color="error"
            variant="soft"
            :loading="busy"
            @click="control(occupying, 'cancel')"
          >
            取消
          </UButton>
        </div>
      </div>
      <div v-else class="space-y-4">
        <UFormField label="步数">
          <UInputNumber v-model="steps" :min="1" :max="1000" />
        </UFormField>
        <div v-for="entry in entries" :key="entry.taskType" class="flex flex-wrap items-center gap-2">
          <span class="w-28 text-sm font-medium">{{ entry.label }}</span>
          <UButton v-if="entry.task === null" :loading="busy" @click="launch(entry.taskType, { steps })">运行</UButton>
          <template v-else-if="entry.task && ['failed', 'canceled', 'abandoned'].includes(entry.task.status)">
            <UButton :loading="busy" @click="retry(entry.task)">重试</UButton>
            <UButton variant="soft" :loading="busy" @click="launch(entry.taskType, { steps })">按当前参数新建</UButton>
          </template>
          <UButton v-else-if="entry.task?.status === 'completed'" :loading="busy" @click="launch(entry.taskType, { steps })">再次运行</UButton>
        </div>
      </div>
    </div>

    <UAlert v-if="existingNotice" color="warning" variant="soft" :description="existingNotice" />
    <UAlert v-if="error" color="error" variant="soft" :description="error" />

    <TaskItem v-for="entry in finishedEntries" :key="entry.taskType" :task="entry.task" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin' });

const { entries, occupying, existingNotice, error, busy, launch, retry, control } = useTaskControl([
  { taskType: 'dev_sample', label: '测试任务' },
  { taskType: 'dev_sample_b', label: '测试任务 B' },
]);

const steps = ref(10);

const finishedEntries = computed(() => entries.value
  .filter(entry => entry.task !== null && !isTaskActive(entry.task))
  .map(entry => ({ taskType: entry.taskType, task: entry.task! })));
</script>
