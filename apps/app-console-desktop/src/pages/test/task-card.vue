<script setup lang="ts">
import type { TaskPageSnapshot, TaskPageTask, TaskStage } from '@tcg-cards/model/src/task'
import { orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: 'Task 测试' })

// --- TaskCard state preview ---

const stageTemplates: Omit<TaskStage, 'status' | 'done' | 'total'>[] = [
  { stageKey: 'loading_baseline', stageIndex: 0, label: 'Load baseline', progressMode: 'simple', resumeMode: 'none', startedAt: null, finishedAt: null },
  { stageKey: 'loading_snapshots', stageIndex: 1, label: 'Load snapshots', progressMode: 'bounded', resumeMode: 'none', startedAt: null, finishedAt: null },
  { stageKey: 'deriving_range', stageIndex: 2, label: 'Derive range', progressMode: 'simple', resumeMode: 'none', startedAt: null, finishedAt: null },
  { stageKey: 'building_diff', stageIndex: 3, label: 'Build diff', progressMode: 'bounded', resumeMode: 'none', startedAt: null, finishedAt: null },
  { stageKey: 'writing_batch', stageIndex: 4, label: 'Write batch', progressMode: 'simple', resumeMode: 'none', startedAt: null, finishedAt: null },
  { stageKey: 'writing_batch_rows', stageIndex: 5, label: 'Write batch rows', progressMode: 'bounded', resumeMode: 'none', startedAt: null, finishedAt: null },
  { stageKey: 'checking_remote_gate', stageIndex: 6, label: 'Check gate', progressMode: 'simple', resumeMode: 'none', startedAt: null, finishedAt: null },
  { stageKey: 'applying_remote', stageIndex: 7, label: 'Apply remote', progressMode: 'bounded', resumeMode: 'none', startedAt: null, finishedAt: null },
  { stageKey: 'finalizing', stageIndex: 8, label: 'Finalize', progressMode: 'simple', resumeMode: 'none', startedAt: null, finishedAt: null },
]

type TaskState = 'idle' | 'pending' | 'running' | 'pausing' | 'paused' | 'resuming' | 'canceling' | 'completed' | 'failed' | 'canceled' | 'abandoned' | 'blocking'

const allStates: TaskState[] = [
  'idle', 'pending', 'running', 'pausing', 'paused', 'resuming',
  'canceling', 'completed', 'failed', 'canceled', 'abandoned', 'blocking',
]

const currentIdx = ref(0)
const currentState = computed(() => allStates[currentIdx.value]!)
const elapsedSec = ref(154)
const now = ref(Date.now())

let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  timer = setInterval(() => {
    if (['running', 'pausing', 'resuming', 'canceling', 'pending'].includes(currentState.value)) {
      elapsedSec.value++
    }
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })

function buildStages(state: TaskState, currentKey: string | null): TaskStage[] {
  if (state === 'pending' || state === 'idle' || state === 'blocking') {
    return stageTemplates.map(t => ({ ...t, status: 'pending' as const, done: null, total: null }))
  }
  const idxCurrent = currentKey ? stageTemplates.findIndex(s => s.stageKey === currentKey) : -1
  return stageTemplates.map((t, i) => {
    let status: TaskStage['status'] = 'pending'
    let done: number | null = null
    let total: number | null = null
    const isCurrent = t.stageKey === currentKey
    if (isCurrent) {
      if (state === 'completed') { status = 'completed'; done = t.progressMode === 'bounded' ? 547 : null; total = t.progressMode === 'bounded' ? 547 : null }
      else if (state === 'paused' || state === 'resuming') { status = 'paused'; done = 342; total = 547 }
      else { status = 'running'; done = t.progressMode === 'bounded' ? 342 : null; total = t.progressMode === 'bounded' ? 547 : null }
    } else if (i < idxCurrent) {
      status = 'completed'; done = t.progressMode === 'bounded' ? 547 : null; total = t.progressMode === 'bounded' ? 547 : null
    }
    return { ...t, status, done, total, startedAt: null, finishedAt: null }
  })
}

const mock = computed(() => {
  const state = currentState.value
  if (state === 'idle') return { pageTask: { kind: 'idle' as const }, stages: [] as TaskStage[], elapsedSec: 0 }
  if (state === 'blocking') {
    return {
      pageTask: { kind: 'blocking' as const, taskRunId: 'mock-blocking-uuid', taskType: 'hearthstone_publish', taskScopeType: 'publish_stream', taskScopeKey: 'hearthstone:staging:card_data', taskScopeSnapshot: { publishTarget: 'hearthstone', environment: 'staging', publishType: 'card_data' }, status: 'running' as const, canCancel: true },
      stages: [] as TaskStage[], elapsedSec: 0,
    }
  }
  const currentKey = state === 'completed' ? 'finalizing'
    : ['failed', 'canceled', 'abandoned'].includes(state) ? 'applying_remote'
    : state === 'pending' ? null : 'applying_remote'
  return {
    pageTask: {
      kind: 'attached' as const, taskRunId: 'mock-task-run-uuid', runRevision: 3,
      taskType: 'hearthstone_publish', taskScopeType: 'publish_stream', taskScopeKey: 'hearthstone:production:card_data',
      taskScopeSnapshot: { publishTarget: 'hearthstone', environment: 'production', publishType: 'card_data' },
      status: state as typeof state, supportsResume: true,
      currentStageKey: currentKey, currentStageIndex: currentKey != null ? stageTemplates.findIndex(s => s.stageKey === currentKey) : null,
      currentResumeMode: currentKey != null ? 'durable' : null, pausedResumeMode: state === 'paused' ? 'durable' : null,
      startedAt: new Date(now.value - elapsedSec.value * 1000).toISOString(),
      finishedAt: ['completed', 'failed', 'canceled', 'abandoned'].includes(state) ? new Date(now.value).toISOString() : null,
      errorCode: state === 'failed' ? 'CONNECTION_TIMEOUT' : null,
      errorMessage: state === 'failed' ? '远程连接超时' : state === 'canceled' ? '用户手动取消' : null,
      terminalReason: state === 'failed' ? 'execution_failed' : state === 'canceled' ? 'manual_cancel' : null,
      canPause: state === 'running', canResume: state === 'paused',
      canCancel: ['pending', 'running', 'pausing', 'paused', 'resuming'].includes(state),
    },
    stages: buildStages(state, currentKey),
    elapsedSec: elapsedSec.value,
  }
})

function next() { currentIdx.value = (currentIdx.value + 1) % allStates.length }
function prev() { currentIdx.value = (currentIdx.value - 1 + allStates.length) % allStates.length }

// --- Heavy task runner ---

const workload = ref(30)
const shouldError = ref(false)
const taskResult = ref<Record<string, unknown> | null>(null)

function onTaskCompleted(snapshot: TaskPageSnapshot) {
  taskResult.value = snapshot.result ?? null
}

const operations = [
  {
    key: 'create',
    label: '开始',
    icon: 'i-lucide-play',
    create: async () => orpc.test.createTask({ workload: workload.value, shouldError: shouldError.value }) as Promise<TaskPageSnapshot>,
  },
]
</script>

<template>
  <div class="page">
    <section class="section">
      <h2 class="section-title">TaskCard 状态预览</h2>
      <div class="card-controls">
        <div class="state-indicator">
          状态：<strong>{{ currentState }}</strong>
        </div>
        <div class="state-nav">
          <button class="btn" @click="prev">← 上一步</button>
          <button class="btn btn-primary" @click="next">下一步 →</button>
        </div>
      </div>

      <TaskCard
        title="发布到 production"
        :page-task="mock.pageTask"
        :stages="mock.stages"
        :elapsed-sec="mock.elapsedSec"
      />

      <div class="state-grid">
        <button
          v-for="s in allStates"
          :key="s"
          :class="{ active: s === currentState }"
          @click="currentIdx = allStates.indexOf(s)"
        >{{ s }}</button>
      </div>
    </section>

    <hr class="divider">

    <section class="section">
      <h2 class="section-title">重量任务运行</h2>

      <TaskController
        title="Heavy Task Test"
        :operations="operations"
        @completed="onTaskCompleted"
      >
        <template #params="{ disabled }">
          <div class="workload-control">
            <label>
              Workload:
              <input v-model.number="workload" type="range" min="5" max="100" :disabled="disabled">
              {{ workload }}
            </label>
          </div>
          <label class="error-toggle">
            <input v-model="shouldError" type="checkbox" :disabled="disabled">
            运行时报错（约 50% 处抛出）
          </label>
        </template>
      </TaskController>

      <div v-if="taskResult" class="result-card">
        <h3 class="result-title">执行结果</h3>
        <div class="result-grid">
          <div class="result-item">
            <span class="result-label">完成</span>
            <span class="result-value">{{ taskResult.completed ? '是' : '否' }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">总 Block 数</span>
            <span class="result-value">{{ taskResult.totalBlocks }}</span>
          </div>
          <div class="result-item">
            <span class="result-label">耗时</span>
            <span class="result-value">{{ taskResult.elapsedMs }}ms</span>
          </div>
          <div class="result-item">
            <span class="result-label">触发报错</span>
            <span class="result-value">{{ taskResult.errorTriggered ? '是' : '否' }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { max-width: 900px; margin: 0 auto; padding: 24px 16px; }

.section { margin-bottom: 32px; }
.section-title { font-size: 17px; font-weight: 600; margin: 0 0 16px; }

.card-controls { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; font-size: 14px; }

.state-nav { display: flex; gap: 8px; }
.btn { padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; background: #fff; color: #374151; font-size: 13px; }
.btn-primary { background: #3b82f6; color: #fff; border-color: #3b82f6; }

.state-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; }
.state-grid button { padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; background: #fff; color: #374151; font-size: 13px; }
.state-grid button.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }

.divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }

.workload-control { margin-bottom: 16px; }
.workload-control label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.error-toggle { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }

.result-card { margin-top: 16px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; background: #fff; }
.result-title { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
.result-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.result-item { display: flex; flex-direction: column; gap: 2px; }
.result-label { font-size: 12px; color: #6b7280; }
.result-value { font-size: 14px; font-weight: 500; font-family: monospace; }
</style>
