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
      <template v-if="multiTaskItems.length > 0">
        <UTabs
          v-model="selectedTaskKey"
          :items="multiTaskTabs"
          :content="false"
          variant="link"
        />
        <div class="pt-4">
          <slot
            :name="selectedTaskKey"
            :active-op="activeOperation"
            :disabled="paramsDisabled"
          />
        </div>
      </template>
      <slot
        v-else
        name="params"
        :active-op="activeOperation"
        :disabled="paramsDisabled"
      />
      <slot />
    </template>

    <template #title>
      <slot name="title" />
    </template>

    <template #actions>
      <slot
        name="actions-before"
        :active-op="activeOperation"
        :disabled="paramsDisabled"
      />
      <UButton
        v-for="op in visibleOperations"
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
  taskType?: string;
  create: () => Promise<TaskPageSnapshot>;
}

/** One task type rendered as a selectable TaskController tab. */
export interface TaskControllerMultiTaskItem {
  key: string;
  label: string;
  icon?: string;
  taskType: string;
  operation: TaskOperation;
}

const props = defineProps<{
  title: string;
  operations: TaskOperation[];
  multiTask?: TaskControllerMultiTaskItem[];
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
const selectedTaskKey = ref(props.multiTask?.[0]?.key ?? '');

let unsubWatch: (() => void) | null = null;

// --- Computed ---

const terminalStatuses: readonly string[] = ['completed', 'failed', 'canceled', 'abandoned'];
const multiTaskItems = computed(() => props.multiTask ?? []);
const multiTaskTabs = computed(() => multiTaskItems.value.map(item => ({
  label: item.label,
  icon: item.icon,
  value: item.key,
  disabled: !isIdle.value && item.key !== selectedTaskKey.value,
})));

const isIdle = computed(() => {
  return pageTask.value.kind === 'idle'
    || (pageTask.value.kind === 'attached' && terminalStatuses.includes(pageTask.value.status));
});

const activeOperation = computed<TaskOperation | null>(() => {
  if (multiTaskItems.value.length > 0) {
    return multiTaskItems.value.find(item => item.key === selectedTaskKey.value)?.operation ?? null;
  }

  if (!activeOpKey.value) return null;
  return props.operations.find(op => op.key === activeOpKey.value) ?? null;
});

const visibleOperations = computed(() => {
  if (multiTaskItems.value.length > 0) {
    return activeOperation.value == null ? [] : [activeOperation.value];
  }

  return props.operations;
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
          selectTaskType(event.pageTask.taskType);
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
  selectTaskType(snapshot.pageTask.taskType);
  pageTask.value = snapshot.pageTask;
  stages.value = snapshot.stages;
  register(snapshot);
  startWatching(snapshot.pageTask.taskRunId);
  activeOpKey.value = null;
}

/** Selects the multi-task tab associated with one attached task type. */
function selectTaskType(taskType: string) {
  const item = multiTaskItems.value.find(candidate => candidate.taskType === taskType);
  if (item) {
    selectedTaskKey.value = item.key;
  }
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
  // Optimistically show canceling so the UI updates immediately
  if (pageTask.value.kind === 'attached') {
    pageTask.value = { ...pageTask.value, status: 'canceling' };
  }
  await orpc.task.cancel({ taskRunId: currentTaskRunId.value });
  // Event stream will send final event when executor transitions to canceled
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
