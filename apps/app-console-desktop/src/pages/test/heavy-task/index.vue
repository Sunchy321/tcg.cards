<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/src/task';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: false, title: 'Heavy Task Test' });

const workload = ref(30);

const operations = [
  {
    key: 'create',
    label: '开始',
    icon: 'i-lucide-play',
    create: async () => orpc.test.createTask({ workload: workload.value }) as Promise<TaskPageSnapshot>,
  },
];
</script>

<template>
  <div class="page">
    <h1>重任务测试</h1>

    <TaskController
      title="Heavy Task Test"
      :operations="operations"
    >
      <template #params="{ disabled }">
        <div class="controls">
          <label>
            Workload:
            <input v-model.number="workload" type="range" min="5" max="100" :disabled="disabled">
            {{ workload }}
          </label>
        </div>
      </template>
    </TaskController>
  </div>
</template>

<style scoped>
.page { max-width: 800px; margin: 24px auto; padding: 0 16px; font-family: system-ui, sans-serif; }
h1 { font-size: 20px; font-weight: 600; margin-bottom: 16px; }
.controls { margin-bottom: 16px; }
.controls label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
</style>
