<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-boxes" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">万智牌数据整理</h1>
          </div>
          <p class="mt-1 text-sm text-muted">将导入的卡牌资料整理成可供网站使用的数据。</p>
        </div>
      </div>
    </div>

    <TaskController
      ref="controller"
      title="整理卡牌数据"
      :operations="[projectOperation]"
      @completed="onCompleted"
      @failed="onFailed"
      @create-error="onCreateError"
      @snapshot="onSnapshot"
    />

    <TaskResultCard :result="taskResult" :labels="PROJECT_RESULT_LABELS" />
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { getDesktopTaskSnapshot, startDesktopTask } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '万智牌数据整理' });

const taskResult = ref<Record<string, unknown> | null>(null);
const controller = ref<{ attach(snapshot: TaskPageSnapshot): void } | null>(null);
const TASK_RUN_KEY = 'console-desktop-magic-project-task';

/** Report labels for this task's result keys. */
const PROJECT_RESULT_LABELS: Record<string, string> = {
  openConflicts: '待处理的卡牌关联',
  cards:         '卡牌',
  cardParts:     '卡牌面',
  cardLocs:      '卡牌译名',
  cardPartLocs:  '卡牌面译文',
  prints:        '印刷',
  printParts:    '印刷面',
  authorities:   '译文来源设置',
  reviews:       '待处理事项',
  softDeleted:   '已清理记录',
};

const projectOperation = computed<TaskOperation>(() => ({
  key:      'project',
  taskType: 'magic_project',
  label:    '整理卡牌数据',
  icon:     'i-lucide-play',
  create:   async () => startDesktopTask('magic_project', {}),
}));

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}
function onFailed() {}
function onCreateError() {}

function onSnapshot(snapshot: TaskPageSnapshot) {
  if (snapshot.pageTask.kind !== 'attached' || snapshot.pageTask.taskType !== 'magic_project') return;
  window.localStorage.setItem(TASK_RUN_KEY, snapshot.pageTask.taskRunId);
}

async function restoreTask() {
  const taskRunId = window.localStorage.getItem(TASK_RUN_KEY);
  if (!taskRunId) return;
  try {
    const snapshot = await getDesktopTaskSnapshot(taskRunId);
    if (snapshot?.pageTask.kind !== 'attached' || snapshot.pageTask.taskType !== 'magic_project') return;
    controller.value?.attach(snapshot);
    onSnapshot(snapshot);
    if (snapshot.pageTask.status === 'completed') onCompleted(snapshot);
  } catch {
    window.localStorage.removeItem(TASK_RUN_KEY);
  }
}

onMounted(() => {
  void restoreTask();
});
</script>
