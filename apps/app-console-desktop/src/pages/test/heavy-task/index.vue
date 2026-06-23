<script setup lang="ts">
import { consumeEventIterator } from '@orpc/client';
import type { TaskPageSnapshot } from '@tcg-cards/model/src/task';

definePageMeta({ layout: false, title: 'Heavy Task Test' });

const runtime = useDesktopRuntimeClient();

const taskRunId = ref<string | null>(null);
const snapshot = ref<TaskPageSnapshot | null>(null);
const workload = ref(30);
const busy = ref(false);
const error = ref('');

let pollTimer: ReturnType<typeof setInterval> | null = null;

function pollSnapshot() {
  pollTimer = setInterval(async () => {
    const id = taskRunId.value;
    if (!id) return;
    try {
      const snap = await runtime.test.snapshot({ taskRunId: id }) as TaskPageSnapshot;
      if (snap.pageTask.kind === 'attached') {
        snapshot.value = snap;
        const s = snap.pageTask.status;
        if (['completed', 'failed', 'canceled', 'abandoned'].includes(s)) {
          taskRunId.value = null;
          stopPoll();
        }
      }
    } catch { /* ignore poll errors */ }
  }, 800);
}

function stopPoll() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function createTask() {
  error.value = '';
  busy.value = true;
  taskRunId.value = null;
  snapshot.value = null;
  stopPoll();

  try {
    const snap = await runtime.test.create({ workload: workload.value }) as TaskPageSnapshot;
    if (snap.pageTask.kind === 'attached') {
      taskRunId.value = snap.pageTask.taskRunId;
      snapshot.value = snap;
      pollSnapshot();
    }
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    busy.value = false;
  }
}

async function pauseTask() {
  if (!taskRunId.value) return;
  try {
    await runtime.test.pause({ taskRunId: taskRunId.value });
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}

async function resumeTask() {
  if (!taskRunId.value) return;
  try {
    await runtime.test.resume({ taskRunId: taskRunId.value });
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}

async function cancelTask() {
  if (!taskRunId.value) return;
  stopPoll();
  try {
    await runtime.test.cancel({ taskRunId: taskRunId.value });
    taskRunId.value = null;
    snapshot.value = null;
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  }
}

const pageTask = computed(() => snapshot.value?.pageTask ?? { kind: 'idle' as const });
const stages = computed(() => snapshot.value?.stages ?? []);
const elapsedSec = computed(() => {
  const pt = pageTask.value;
  if (pt.kind !== 'attached' || !pt.startedAt) return 0;
  const start = new Date(pt.startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  const end = pt.finishedAt ? new Date(pt.finishedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 1000));
});
</script>

<template>
  <div class="page">
    <h1>重任务测试</h1>

    <div class="controls">
      <label>
        Workload:
        <input v-model.number="workload" type="range" min="5" max="100" :disabled="busy">
        {{ workload }}
      </label>

    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <TaskCard
      title="Heavy Task Test"
      :page-task="pageTask"
      :stages="stages"
      :elapsed-sec="elapsedSec"
      @cancel="cancelTask"
      @pause="pauseTask"
      @resume="resumeTask"
    >
      <template #actions>
        <UButton color="primary" :disabled="busy || !!taskRunId" @click="createTask">
          开始
        </UButton>
      </template>
    </TaskCard>
  </div>
</template>

<style scoped>
.page { max-width: 800px; margin: 24px auto; padding: 0 16px; font-family: system-ui, sans-serif; }
h1 { font-size: 20px; font-weight: 600; margin-bottom: 16px; }
.controls { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.controls { margin-bottom: 16px; }
.controls label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.error { padding: 8px 12px; background: #fef2f2; color: #dc2626; border-radius: 6px; margin-bottom: 12px; font-size: 13px; }
</style>
