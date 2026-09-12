<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-boxes" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">万智牌投影</h1>
          </div>
          <p class="mt-1 text-sm text-muted">把本地收集的卡牌原始数据整理成站点可用的卡牌数据。</p>
        </div>
      </div>
    </div>

    <TaskController
      title="投影"
      :operations="[projectOperation]"
      @completed="onCompleted"
      @failed="onFailed"
      @create-error="onCreateError"
    />

    <TaskResultCard :result="taskResult" />
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '投影' });

const taskResult = ref<Record<string, unknown> | null>(null);

const projectOperation = computed<TaskOperation>(() => ({
  key:    'project',
  label:  '运行投影',
  icon:   'i-lucide-play',
  create: async () => orpc.magic.createTask.magicProject({}) as Promise<TaskPageSnapshot>,
}));

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}
function onFailed() {}
function onCreateError() {}
</script>
