<script setup lang="ts">
import type { TaskPageTask, TaskStage } from '@tcg-cards/model/src/task'

definePageMeta({ layout: false, title: 'TaskCard Dev Test' })

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
      pageTask: { kind: 'blocking' as const, taskRunId: 'mock-blocking-uuid', taskType: 'hsdata_publish', taskScopeType: 'publish_stream', taskScopeKey: 'hearthstone:staging:card_data', taskScopeSnapshot: { publishTarget: 'hearthstone', environment: 'staging', publishType: 'card_data' }, status: 'running' as const, canCancel: true },
      stages: [] as TaskStage[], elapsedSec: 0,
    }
  }
  const currentKey = state === 'completed' ? 'finalizing'
    : ['failed', 'canceled', 'abandoned'].includes(state) ? 'applying_remote'
    : state === 'pending' ? null : 'applying_remote'
  return {
    pageTask: {
      kind: 'attached' as const, taskRunId: 'mock-task-run-uuid', runRevision: 3,
      taskType: 'hsdata_publish', taskScopeType: 'publish_stream', taskScopeKey: 'hearthstone:production:card_data',
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
</script>

<template>
  <div class="tc-container">
    <div class="tc-header">
      <h1>TaskCard 测试</h1>
      <div class="tc-header-right">
        <span>状态：<strong>{{ currentState }}</strong></span>
        <button class="tc-btn" @click="prev">← 上一步</button>
        <button class="tc-btn tc-btn-primary" @click="next">下一步 →</button>
      </div>
    </div>

    <TaskCard
      title="发布到 production"
      :page-task="mock.pageTask"
      :stages="mock.stages"
      :elapsed-sec="mock.elapsedSec"
    />

    <div class="tc-state-switcher">
      <button v-for="s in allStates" :key="s" :class="{ active: s === currentState }" @click="currentIdx = allStates.indexOf(s)">{{ s }}</button>
    </div>
  </div>
</template>

<style scoped>
.tc-container { max-width: 900px; margin: 24px auto; padding: 0 16px; }
.tc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.tc-header h1 { font-size: 18px; font-weight: 600; margin: 0; }
.tc-header-right { display: flex; align-items: center; gap: 12px; font-size: 14px; }
.tc-btn { padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; background: #fff; color: #374151; }
.tc-btn-primary { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.tc-state-switcher { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 24px; }
.tc-state-switcher button { padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; background: #fff; color: #374151; }
.tc-state-switcher button.active { background: #3b82f6; color: #fff; border-color: #3b82f6; }
</style>
