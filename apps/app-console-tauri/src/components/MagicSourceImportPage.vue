<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon :name="icon" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">{{ title }}</h1>
          </div>
          <p class="mt-1 text-sm text-muted">{{ description }}</p>
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
          <span>尚未配置数据根，请在设置页配置后重新刷新。</span>
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
        :title="taskTitle"
        :operations="[operation]"
        @completed="onCompleted"
        @failed="onFailed"
        @create-error="onCreateError"
      >
        <template #params="{ disabled }">
          <slot name="params" :disabled="disabled" :data-state="dataState" />
        </template>
      </TaskController>

      <TaskResultCard :result="taskResult" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { getMagicDataState, type MagicDataState } from '~/composables/useMagicData';

const props = defineProps<{
  title:       string;
  icon:        string;
  description: string;
  taskTitle:   string;
  operation:   TaskOperation;
}>();

const dataState = ref<MagicDataState | null>(null);
const loading = ref(false);
const loadError = ref('');
const taskResult = ref<Record<string, unknown> | null>(null);

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

onMounted(() => {
  void load();
});
</script>
