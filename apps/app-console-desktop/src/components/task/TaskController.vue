<template>
  <TaskCard
    :title="title"
    :page-task="pageTask"
    :stages="stages"
    @pause="handleControl('pause')"
    @resume="handleControl('resume')"
    @cancel="handleControl('cancel')"
    @retry="handleRetry"
  >
    <template #default>
      <template v-if="multiTaskItems.length > 0">
        <UTabs v-model="selectedTaskKey" :items="multiTaskTabs" :content="false" variant="link" />
        <div class="pt-4">
          <slot :name="selectedTaskKey" :active-op="activeOperation" :disabled="paramsDisabled" />
        </div>
      </template>
      <slot v-else name="params" :active-op="activeOperation" :disabled="paramsDisabled" />
      <slot />
    </template>

    <template #title><slot name="title" /></template>

    <template #actions>
      <slot name="actions-before" :active-op="activeOperation" :disabled="paramsDisabled" />
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
import { useToast } from '@nuxt/ui/composables';
import type { TaskPageSnapshot, TaskPageTask, TaskRunStatus, TaskStage } from '@tcg-cards/model/task';
import type { TaskView } from '../../../electron/contract';

export interface TaskOperation {
  key:       string;
  label:     string;
  icon?:     string;
  color?:    'primary' | 'warning' | 'error' | 'neutral';
  disabled?: boolean;
  taskType?: string;
  create:    () => Promise<TaskPageSnapshot | null>;
}

export interface TaskControllerMultiTaskItem {
  key:       string;
  label:     string;
  icon?:     string;
  taskType:  string;
  operation: TaskOperation;
}

const props = defineProps<{ title: string, operations: TaskOperation[], multiTask?: TaskControllerMultiTaskItem[] }>();
const emit = defineEmits<{
  'completed':     [snapshot: TaskPageSnapshot];
  'failed':        [taskRunId: string, errorCode: string | null, errorMessage: string | null];
  'create-error':  [opKey: string, message: string];
  'status-change': [status: TaskRunStatus];
  'snapshot':      [snapshot: TaskPageSnapshot];
}>();

const pageTask = ref<TaskPageTask>({ kind: 'idle' });
const stages = ref<TaskStage[]>([]);
const currentTaskRunId = ref<string | null>(null);
const isCreating = ref(false);
const activeOpKey = ref<string | null>(null);
const selectedTaskKey = ref(props.multiTask?.[0]?.key ?? '');
let unsubscribe: (() => void) | null = null;
let lastStatus: string | null = null;

const terminalStatuses = ['completed', 'failed', 'canceled', 'abandoned'];
const multiTaskItems = computed(() => props.multiTask ?? []);
const multiTaskTabs = computed(() => multiTaskItems.value.map(item => ({
  label:    item.label,
  icon:     item.icon,
  value:    item.key,
  disabled: !isIdle.value && item.key !== selectedTaskKey.value,
})));
const isIdle = computed(() => pageTask.value.kind === 'idle'
  || (pageTask.value.kind === 'attached' && terminalStatuses.includes(pageTask.value.status)));
const activeOperation = computed<TaskOperation | null>(() => multiTaskItems.value.length > 0
  ? multiTaskItems.value.find(item => item.key === selectedTaskKey.value)?.operation ?? null
  : props.operations.find(item => item.key === activeOpKey.value) ?? null);
const visibleOperations = computed(() => multiTaskItems.value.length > 0
  ? activeOperation.value ? [activeOperation.value] : []
  : props.operations);
const paramsDisabled = computed(() => !isIdle.value || isCreating.value);

function selectTaskType(taskType: string) {
  const item = multiTaskItems.value.find(candidate => candidate.taskType === taskType);
  if (item) selectedTaskKey.value = item.key;
}

function applySnapshot(snapshot: TaskPageSnapshot, notify = false) {
  if (snapshot.pageTask.kind === 'attached') {
    selectTaskType(snapshot.pageTask.taskType);
    currentTaskRunId.value = snapshot.pageTask.taskRunId;
    lastStatus = snapshot.pageTask.status;
    pageTask.value = snapshot.pageTask;
    stages.value = snapshot.stages;
    emit('snapshot', snapshot);
    emit('status-change', snapshot.pageTask.status);
    if (notify && snapshot.pageTask.status === 'completed') emit('completed', snapshot);
    if (notify && snapshot.pageTask.status === 'failed') {
      emit('failed', snapshot.pageTask.taskRunId, snapshot.pageTask.errorCode, snapshot.pageTask.errorMessage);
    }
  }
}

function attach(snapshot: TaskPageSnapshot) {
  stopWatching();
  applySnapshot(snapshot);
  if (snapshot.pageTask.kind === 'attached') startWatching(snapshot.pageTask.taskRunId);
  activeOpKey.value = null;
}

function startWatching(taskRunId: string) {
  stopWatching();
  currentTaskRunId.value = taskRunId;
  unsubscribe = window.desktop.tasks.onChange((task: TaskView) => {
    if (task.id !== taskRunId || !task.pageSnapshot) return;
    const previousStatus = lastStatus;
    applySnapshot(task.pageSnapshot, previousStatus !== task.status);
  });
}

function stopWatching() {
  unsubscribe?.();
  unsubscribe = null;
  currentTaskRunId.value = null;
}

async function attachById(taskRunId: string) {
  const task = await window.desktop.tasks.get(taskRunId);
  if (task?.pageSnapshot) attach(task.pageSnapshot);
}

async function execute(operation: TaskOperation) {
  if (!isIdle.value || isCreating.value) return;
  isCreating.value = true;
  activeOpKey.value = operation.key;
  try {
    const snapshot = await operation.create();
    if (snapshot?.pageTask.kind === 'attached') {
      attach(snapshot);
      if (snapshot.pageTask.status === 'completed') emit('completed', snapshot);
      else if (snapshot.pageTask.status === 'failed') {
        emit('failed', snapshot.pageTask.taskRunId, snapshot.pageTask.errorCode, snapshot.pageTask.errorMessage);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit('create-error', operation.key, message);
    useToast().add({ title: '创建任务失败', description: message, color: 'error' });
  } finally {
    isCreating.value = false;
  }
}

async function handleControl(kind: 'pause' | 'resume' | 'cancel') {
  if (!currentTaskRunId.value) return;
  try {
    const task = await window.desktop.tasks.control(currentTaskRunId.value, kind);
    if (task.pageSnapshot) applySnapshot(task.pageSnapshot);
  } catch (error) {
    useToast().add({ title: '任务操作失败', description: error instanceof Error ? error.message : String(error), color: 'error' });
  }
}

async function handleRetry() {
  if (!currentTaskRunId.value) return;
  try {
    const result = await window.desktop.tasks.retry(currentTaskRunId.value);
    if (result) await attachById(result.taskRunId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit('create-error', activeOpKey.value ?? 'retry', message);
    useToast().add({ title: '重试任务失败', description: message, color: 'error' });
  }
}

function reset() {
  stopWatching();
  pageTask.value = { kind: 'idle' };
  stages.value = [];
  activeOpKey.value = null;
  isCreating.value = false;
}

onBeforeUnmount(stopWatching);
defineExpose({ execute, attach, attachById, reset, currentTaskRunId, isCreating, pageTask, stages });
</script>
