<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-globe" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">CNOCG 官方库爬取</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            从游戏王官方简中卡片数据库逐卡抓取官方卡文与收录数据，缓存于本地。
          </p>
        </div>
      </div>
    </div>

    <UAlert
      v-if="createError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="createError"
    />

    <div class="grid gap-4">
      <TaskController
        ref="controller"
        title="CNOCG 官方库爬取"
        :operations="[operation]"
        @completed="onCompleted"
        @failed="onFailed"
        @create-error="onCreateError"
        @snapshot="onSnapshot"
      >
        <template #params="{ disabled }">
          <div class="grid gap-4 pt-4 xl:grid-cols-3">
            <UFormField label="级别" orientation="horizontal" class="flex-1" :ui="formFieldUi">
              <USelect v-model="form.level" :items="levelItems" :disabled="disabled" class="w-full" />
            </UFormField>
            <UFormField label="并发数" orientation="horizontal" class="flex-1" :ui="formFieldUi">
              <UInputNumber v-model="form.concurrency" :min="1" :max="8" :disabled="disabled" class="w-full" />
            </UFormField>
            <UFormField label="请求间隔 (ms)" orientation="horizontal" class="flex-1" :ui="formFieldUi">
              <UInputNumber v-model="form.delayMs" :min="50" :max="5000" :step="50" :disabled="disabled" class="w-full" />
            </UFormField>
          </div>
        </template>
      </TaskController>

      <TaskResultCard :result="taskResult" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import type { TaskView } from '../../../../../electron/contract';
import { useTasks } from '~/composables/useTasks';
import { getDesktopTaskSnapshot, startDesktopTask } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: 'CNOCG 官方库爬取' });

type KonamiLevel = 'fill' | 'refresh' | 'refresh_all' | 'force';

interface CnocgForm {
  level:       KonamiLevel;
  concurrency: number;
  delayMs:     number;
}

/** Persists the crawl parameters so the page reopens with the last-used values. */
const STATE_KEY = 'console-desktop-yugioh-cnocg-page';

function loadForm(): CnocgForm {
  if (!import.meta.client) return { level: 'refresh', concurrency: 1, delayMs: 500 };
  try {
    const r = localStorage.getItem(STATE_KEY);
    if (r) return JSON.parse(r) as CnocgForm;
  } catch { /* ignore corrupted state */ }
  return { level: 'refresh', concurrency: 1, delayMs: 500 };
}

function saveForm() {
  if (!import.meta.client) return;
  localStorage.setItem(STATE_KEY, JSON.stringify(form));
}

const form = reactive<CnocgForm>(loadForm());
watch(form, saveForm, { deep: true });

/** Horizontal form fields: label next to the control with a small gap, control fills the rest. */
const formFieldUi = { root: 'flex items-center gap-3', container: 'relative flex-1' };

const levelItems: { label: string, value: KonamiLevel }[] = [
  { label: '补齐缺失资料', value: 'fill' },
  { label: '更新过期资料', value: 'refresh' },
  { label: '更新全部资料', value: 'refresh_all' },
  { label: '重新抓取全部', value: 'force' },
];

const createError = ref('');
const taskResult = ref<Record<string, unknown> | null>(null);
const controller = ref<{ attach(snapshot: TaskPageSnapshot): void } | null>(null);
const taskStore = useTasks();
const TASK_TYPE = 'yugioh_cnocg_import';
const TASK_KEY = 'console-desktop-yugioh-cnocg-import-task';

const operation = computed<TaskOperation>(() => ({
  key:      'cnocg',
  taskType: TASK_TYPE,
  label:    '爬取 CNOCG',
  icon:     'i-lucide-play',
  disabled: taskStore.active.value.some((task: TaskView) => task.taskType.startsWith('yugioh_') && task.taskType !== TASK_TYPE),
  create:   () => startDesktopTask(TASK_TYPE, {
    level:       form.level,
    concurrency: form.concurrency,
    delayMs:     form.delayMs,
  }),
}));

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}
function onFailed() {}
function onCreateError(_opKey: string, message: string) {
  createError.value = message;
}

function onSnapshot(snapshot: TaskPageSnapshot) {
  if (snapshot.pageTask.kind === 'attached' && snapshot.pageTask.taskType === TASK_TYPE) {
    window.localStorage.setItem(TASK_KEY, snapshot.pageTask.taskRunId);
  }
}

async function restoreTask() {
  await taskStore.refresh([TASK_TYPE]);
  const storedId = window.localStorage.getItem(TASK_KEY);
  if (storedId) {
    const snapshot = await getDesktopTaskSnapshot(storedId).catch(() => null);
    if (snapshot?.pageTask.kind === 'attached' && snapshot.pageTask.taskType === TASK_TYPE) {
      controller.value?.attach(snapshot);
      return;
    }
    window.localStorage.removeItem(TASK_KEY);
  }
  const task = taskStore.taskOfType(TASK_TYPE);
  if (task?.pageSnapshot) controller.value?.attach(task.pageSnapshot);
}

onMounted(() => void restoreTask());
</script>
