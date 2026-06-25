<template>
  <TaskCard
    :title="title"
    :page-task="pageTask"
    :stages="stages"
    @pause="handlePause"
    @resume="handleResume"
    @cancel="handleCancel"
    @retry="handleRetry"
  >
    <template #default>
      <slot name="params" :active-op="activeOperation" :disabled="paramsDisabled" />
      <slot />
    </template>

    <template #title>
      <slot name="title" />
    </template>

    <template #actions>
      <UButton
        v-for="op in operations"
        :key="op.key"
        :icon="op.icon"
        :color="op.color ?? 'primary'"
        :variant="op.color ? 'soft' : 'solid'"
        :loading="isCreating && activeOpKey === op.key"
        :disabled="!isIdle || isCreating || op.disabled"
        @click="execute(op)"
      >
        {{ op.label }}
      </UButton>
      <slot name="actions" />
    </template>
  </TaskCard>
</template>

<script setup lang="ts">
import { consumeEventIterator } from '@orpc/client';
import type { TaskPageSnapshot, TaskPageEvent, TaskPageTask, TaskStage, TaskRunStatus } from '@tcg-cards/model/src/task';
import { orpc } from '~/lib/orpc';
import { useTaskRegistry } from '~/composables/useTaskRegistry';

export interface TaskOperation {
  key: string;
  label: string;
  icon?: string;
  color?: 'primary' | 'warning' | 'error' | 'neutral';
  disabled?: boolean;
  create: () => Promise<TaskPageSnapshot>;
}

const props = defineProps<{
  title: string;
  operations: TaskOperation[];
}>();

const emit = defineEmits<{
  completed: [snapshot: TaskPageSnapshot];
  failed: [taskRunId: string, errorCode: string | null, errorMessage: string | null];
  'create-error': [opKey: string, message: string];
  'status-change': [status: TaskRunStatus];
}>();

const { register } = useTaskRegistry();

// --- Reactive state ---

const pageTask = ref<TaskPageTask>({ kind: 'idle' });
const stages = ref<TaskStage[]>([]);
const currentTaskRunId = ref<string | null>(null);
const isCreating = ref(false);
const activeOpKey = ref<string | null>(null);

let unsubWatch: (() => void) | null = null;

// --- Computed ---

const terminalStatuses: readonly string[] = ['completed', 'failed', 'canceled', 'abandoned'];

const isIdle = computed(() => {
  return pageTask.value.kind === 'idle'
    || (pageTask.value.kind === 'attached' && terminalStatuses.includes(pageTask.value.status));
});

const activeOperation = computed<TaskOperation | null>(() => {
  if (!activeOpKey.value) return null;
  return props.operations.find(op => op.key === activeOpKey.value) ?? null;
});

const paramsDisabled = computed(() => !isIdle.value || isCreating.value);

// --- Watch subscription ---

function startWatching(taskRunId: string) {
  stopWatching();
  currentTaskRunId.value = taskRunId;

  unsubWatch = consumeEventIterator(
    orpc.task.watch({ taskRunId }),
    {
      onEvent(event: TaskPageEvent) {
        pageTask.value = event.pageTask;
        stages.value = event.stages;

        if (event.pageTask.kind === 'attached') {
          emit('status-change', event.pageTask.status);
          const status = event.pageTask.status;
          if (status === 'completed') {
            emit('completed', event);
          } else if (status === 'failed') {
            emit('failed', taskRunId, event.pageTask.errorCode, event.pageTask.errorMessage);
          }
        }
      },
    },
  );
}

function stopWatching() {
  if (unsubWatch) {
    unsubWatch();
    unsubWatch = null;
  }
  currentTaskRunId.value = null;
}

// --- Public API ---

async function execute(op: TaskOperation) {
  if (!isIdle.value || isCreating.value) return;
  isCreating.value = true;
  activeOpKey.value = op.key;
  try {
    const snapshot = await op.create();
    if (snapshot.pageTask.kind === 'attached') {
      pageTask.value = snapshot.pageTask;
      stages.value = snapshot.stages;
      register(snapshot);
      startWatching(snapshot.pageTask.taskRunId);
    }
  } catch (error: any) {
    emit('create-error', op.key, error?.message ?? String(error));
  } finally {
    isCreating.value = false;
  }
}

function attach(snapshot: TaskPageSnapshot) {
  if (snapshot.pageTask.kind !== 'attached') return;
  pageTask.value = snapshot.pageTask;
  stages.value = snapshot.stages;
  register(snapshot);
  startWatching(snapshot.pageTask.taskRunId);
  activeOpKey.value = null;
}

function reset() {
  stopWatching();
  pageTask.value = { kind: 'idle' };
  stages.value = [];
  activeOpKey.value = null;
  isCreating.value = false;
}

// --- Control handlers (delegated by TaskCard) ---

async function handlePause() {
  if (!currentTaskRunId.value) return;
  await orpc.task.pause({ taskRunId: currentTaskRunId.value });
}

async function handleResume() {
  if (!currentTaskRunId.value) return;
  await orpc.task.resume({ taskRunId: currentTaskRunId.value });
}

async function handleCancel() {
  if (!currentTaskRunId.value) return;
  await orpc.task.cancel({ taskRunId: currentTaskRunId.value });
  // Event stream will update pageTask/stages
}

async function handleRetry() {
  if (!currentTaskRunId.value) return;
  try {
    const result = await orpc.task.retry({ taskRunId: currentTaskRunId.value }) as TaskPageSnapshot;
    if (result.pageTask.kind === 'attached') {
      pageTask.value = result.pageTask;
      stages.value = result.stages;
      register(result);
      startWatching(result.pageTask.taskRunId);
    }
  } catch (error: any) {
    emit('create-error', activeOpKey.value ?? 'retry', error?.message ?? String(error));
  }
}

// --- Lifecycle ---

onUnmounted(() => {
  stopWatching();
});

defineExpose({ execute, attach, reset, currentTaskRunId, isCreating, pageTask, stages });
</script>
