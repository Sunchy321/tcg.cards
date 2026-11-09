<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon :name="props.icon" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">{{ props.title }}</h1>
          </div>
          <p class="mt-1 text-sm text-muted">{{ props.description }}</p>
        </div>
        <div class="ml-auto flex gap-2">
          <UButton label="打开设置" icon="i-lucide-settings" color="neutral" variant="soft" to="/settings/games/magic" />
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
        </div>
      </div>
    </div>

    <UAlert v-if="dataState && !dataState.dataDir" color="warning" variant="soft" icon="i-lucide-folder-search">
      <template #description>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>尚未选择本地资料文件夹，请在设置页选择后重新刷新。</span>
          <div class="sm:ml-auto">
            <UButton label="打开设置" icon="i-lucide-settings" color="warning" variant="soft" to="/settings/games/magic" />
          </div>
        </div>
      </template>
    </UAlert>

    <UAlert
      v-if="loadError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="loadError"
    />

    <div class="grid gap-4">
      <TaskController
        ref="controller"
        :title="props.taskTitle"
        :operations="[props.operation]"
        @completed="onCompleted"
        @failed="onFailed"
        @create-error="onCreateError"
        @snapshot="onSnapshot"
      >
        <template #params="{ disabled }">
          <slot name="params" :disabled="disabled" :data-state="dataState" />
        </template>
      </TaskController>

      <TaskResultCard :result="taskResult" :labels="props.resultLabels" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { getDesktopTaskSnapshot } from '~/lib/orpc';
import { getMagicDataState, type MagicDataState } from '~/composables/useMagicData';

const props = defineProps<{
  title:         string;
  icon:          string;
  description:   string;
  taskTitle:     string;
  operation:     TaskOperation;
  resultLabels?: Record<string, string>;
}>();

const dataState = ref<MagicDataState | null>(null);
const loading = ref(false);
const loadError = ref('');
const taskResult = ref<Record<string, unknown> | null>(null);
const controller = ref<{ attach(snapshot: TaskPageSnapshot): void } | null>(null);
const taskRunKey = computed(() => `console-desktop-magic-task:${props.operation.taskType ?? props.taskTitle}`);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    dataState.value = await getMagicDataState();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
  load();
}
function onFailed() {}
function onCreateError() {}

function onSnapshot(snapshot: TaskPageSnapshot) {
  if (snapshot.pageTask.kind !== 'attached') return;
  if (props.operation.taskType && snapshot.pageTask.taskType !== props.operation.taskType) return;
  window.localStorage.setItem(taskRunKey.value, snapshot.pageTask.taskRunId);
}

async function restoreTask() {
  const taskRunId = window.localStorage.getItem(taskRunKey.value);
  if (!taskRunId) return;
  try {
    const snapshot = await getDesktopTaskSnapshot(taskRunId);
    if (snapshot?.pageTask.kind !== 'attached') return;
    if (props.operation.taskType && snapshot.pageTask.taskType !== props.operation.taskType) return;
    controller.value?.attach(snapshot);
    onSnapshot(snapshot);
    if (snapshot.pageTask.status === 'completed') onCompleted(snapshot);
  } catch {
    window.localStorage.removeItem(taskRunKey.value);
  }
}

onMounted(() => {
  void load();
  void restoreTask();
});
</script>
