<template>
  <div class="desktop-page space-y-4">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-cloud-upload" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">推送</h1>
          </div>
          <p class="mt-1 text-sm text-muted">将本地待推送的标签变更发送到远端。</p>
        </div>
        <div class="flex items-center gap-3 text-sm text-muted">
          <span>hearthstone</span>
          <UDropdownMenu v-if="publishTargets.length > 1" :items="environmentItems" :content="{ align: 'end' }">
            <UButton :label="selectedTarget?.environment ?? '选择目标'" icon="i-lucide-chevron-down" color="neutral" variant="ghost" />
          </UDropdownMenu>
          <UBadge v-else-if="selectedTarget" :label="selectedTarget.environment" color="neutral" variant="soft" />
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="historyLoading" @click="refreshData" />
        </div>
      </div>
    </div>

    <UAlert
      v-if="targetError"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      :description="targetError"
    />
    <UAlert v-else-if="!selectedTarget" color="warning" variant="soft" icon="i-lucide-plug-zap">
      <template #title>尚未配置推送目标</template>
      <template #description>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>请先在设置页配置并验证 Hearthstone 推送目标。</span>
          <UButton label="打开设置" icon="i-lucide-settings" color="warning" variant="soft" to="/settings/games/hearthstone" />
        </div>
      </template>
    </UAlert>

    <UAlert v-if="incompleteBatch" color="warning" variant="soft" icon="i-lucide-triangle-alert">
      <template #title>检测到未完成的推送</template>
      <template #description>
        上次推送于 {{ formatTime(incompleteBatch.startedAt) }} 中断。重新推送时会从本地尚未同步的标签变更继续。
      </template>
    </UAlert>

    <TaskController
      ref="controller"
      title="标签推送"
      :operations="[pushOperation]"
      @completed="onCompleted"
      @failed="onFailed"
      @create-error="onCreateError"
    >
      <template #params>
        <div class="space-y-3 pt-4">
          <div class="font-medium">推送标签变更</div>
          <p class="text-xs text-muted">推送开始前会验证账号权限并确认目标环境。</p>
          <div v-if="selectedTarget" class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">目标环境</div>
            <div class="mt-1 text-sm font-medium">{{ selectedTarget.environment }}</div>
          </div>
        </div>
      </template>
    </TaskController>

    <UCard v-if="pushResult">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-medium">推送报告</span>
          <UBadge :label="pushResult.blockedReason ? '受阻' : '完成'" :color="pushResult.blockedReason ? 'warning' : 'success'" variant="soft" size="xs" />
        </div>
      </template>
      <div class="space-y-4">
        <UAlert v-if="pushResult.blockedReason" color="warning" variant="soft" icon="i-lucide-triangle-alert">
          <template #title>推送未能继续</template>
          <template #description>{{ pushResult.blockedMessage }}</template>
        </UAlert>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">已推送</div>
            <div class="mt-1 font-mono text-lg font-semibold">{{ pushResult.pushed.length }}</div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">已应用</div>
            <div class="mt-1 font-mono text-lg font-semibold text-success">{{ appliedCount }}</div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">重复</div>
            <div class="mt-1 font-mono text-lg font-semibold text-muted">{{ duplicateCount }}</div>
          </div>
          <div class="rounded-lg border border-default p-3">
            <div class="text-xs text-muted">完成时间</div>
            <div class="mt-1 font-mono text-sm">{{ formatTime(pushResult.finishedAt) }}</div>
          </div>
        </div>
        <div v-if="pushResult.pushed.length > 0" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-default text-left text-xs text-muted">
                <th class="px-3 py-2 font-normal">序号</th>
                <th class="px-3 py-2 font-normal">状态</th>
                <th class="px-3 py-2 font-normal">Mutation ID</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in pushResult.pushed" :key="item.localSequence" class="border-b border-default">
                <td class="px-3 py-2 font-mono text-xs">{{ item.localSequence }}</td>
                <td class="px-3 py-2">
                  <UBadge :label="item.status === 'applied' ? '已应用' : '重复'" :color="item.status === 'applied' ? 'success' : 'neutral'" variant="soft" size="xs" />
                </td>
                <td class="max-w-64 truncate px-3 py-2 font-mono text-xs text-muted">{{ item.clientMutationId }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">推送历史</span>
          <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="historyLoading" @click="refreshData" />
        </div>
      </template>
      <div v-if="historyLoading && history.length === 0" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
      </div>
      <div v-else-if="history.length === 0" class="py-8 text-center text-sm text-muted">暂无推送记录</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-xs text-muted">
              <th class="px-3 py-2 font-normal">状态</th>
              <th class="px-3 py-2 font-normal">已推送</th>
              <th class="px-3 py-2 font-normal">重复</th>
              <th class="px-3 py-2 font-normal">未完成原因</th>
              <th class="px-3 py-2 font-normal">时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="batch in history" :key="batch.id" class="border-b border-default">
              <td class="px-3 py-2">
                <UBadge :label="batchStatusLabel(batch.status)" :color="batchStatusColor(batch.status)" variant="soft" size="xs" />
              </td>
              <td class="px-3 py-2 font-mono text-xs">{{ batch.pushedCount }}</td>
              <td class="px-3 py-2 font-mono text-xs text-muted">{{ batch.duplicateCount }}</td>
              <td class="max-w-64 truncate px-3 py-2 text-xs text-muted">{{ batch.blockedReason ? `${batch.blockedReason}: ${batch.blockedMessage ?? ''}` : '—' }}</td>
              <td class="px-3 py-2 text-xs text-muted">{{ formatTime(batch.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { getDesktopPublishTargets, type DesktopPublishTarget } from '~/composables/useDesktopSettings';
import { getHsdataErrorMessage } from '~/composables/useHsdataRepo';
import { startDesktopTask, orpc } from '~/lib/orpc';

definePageMeta({ layout: 'admin', title: '推送' });

const TASK_TYPE = 'hearthstone_tag_push';
const TARGET_KEY = 'console-desktop-hearthstone-tag-push-environment';
const toast = useToast();

interface PushBatchRow {
  id:              string;
  stream:          string;
  consumer:        string;
  status:          string;
  pushedCount:     number;
  duplicateCount:  number;
  blockedReason:   string | null;
  blockedMessage:  string | null;
  blockedSequence: number | null;
  startedAt:       string;
  completedAt:     string | null;
  createdAt:       string;
}

interface TagPushReport {
  batchId:            string;
  stream:             string;
  consumer:           string;
  pushed:             Array<{ localCommitId: string, localSequence: number, clientMutationId: string, status: 'applied' | 'duplicate' }>;
  lastPushedSequence: number;
  blockedSequence:    number | null;
  blockedReason:      'conflict' | 'error' | null;
  blockedMessage:     string | null;
  startedAt:          string;
  finishedAt:         string;
}

const controller = ref<{ attach(snapshot: TaskPageSnapshot): void, currentTaskRunId: string | null }>();
const publishTargets = ref<DesktopPublishTarget[]>([]);
const selectedEnvironment = ref('');
const targetError = ref('');
const history = ref<PushBatchRow[]>([]);
const incompleteBatch = ref<{ id: string, stream: string, startedAt: string } | null>(null);
const historyLoading = ref(false);
const pushResult = ref<TagPushReport | null>(null);

const selectedTarget = computed(() => publishTargets.value.find(target => target.environment === selectedEnvironment.value) ?? null);
const environmentItems = computed(() => publishTargets.value.map(target => ({
  label:    target.environment,
  value:    target.environment,
  onSelect: () => { selectedEnvironment.value = target.environment; },
})));
const appliedCount = computed(() => pushResult.value?.pushed.filter(item => item.status === 'applied').length ?? 0);
const duplicateCount = computed(() => pushResult.value?.pushed.filter(item => item.status === 'duplicate').length ?? 0);

/** Starts the independent tag push through the Electron task admission flow. */
const pushOperation = computed<TaskOperation>(() => ({
  key:      'push',
  label:    '开始推送',
  icon:     'i-lucide-cloud-upload',
  disabled: selectedTarget.value == null,
  create:   async () => {
    pushResult.value = null;
    return await startDesktopTask(TASK_TYPE, {
      publishTarget: 'hearthstone',
      environment:   selectedEnvironment.value,
    });
  },
}));

/** Loads target identities without exposing credentials to the renderer. */
async function loadTarget() {
  targetError.value = '';
  try {
    publishTargets.value = (await getDesktopPublishTargets()).filter(target => target.publishTarget === 'hearthstone');
    const saved = window.localStorage.getItem(TARGET_KEY) ?? '';
    selectedEnvironment.value = publishTargets.value.some(target => target.environment === saved)
      ? saved
      : publishTargets.value[0]?.environment ?? '';
  } catch (error) {
    targetError.value = getHsdataErrorMessage(error);
    publishTargets.value = [];
    selectedEnvironment.value = '';
  }
}

/** Refreshes the recent history and any batch left incomplete by a restart. */
async function refreshData() {
  historyLoading.value = true;
  try {
    const [batches, incomplete] = await Promise.all([
      orpc.hearthstone.tag.listPushBatches(),
      orpc.hearthstone.tag.getIncompletePushBatch(),
    ]);
    history.value = batches as PushBatchRow[];
    incompleteBatch.value = incomplete;
  } catch (error) {
    toast.add({ title: '加载推送记录失败', description: getHsdataErrorMessage(error), color: 'error' });
  } finally {
    historyLoading.value = false;
  }
}

/** Restores the last task snapshot and its saved report after navigation or restart. */
async function restoreTask() {
  try {
    const tasks = await window.desktop.tasks.latestByTypes([TASK_TYPE]);
    const task = tasks[0];
    if (task?.pageSnapshot) {
      controller.value?.attach(task.pageSnapshot);
      pushResult.value = task.pageSnapshot.result as unknown as TagPushReport ?? null;
    }
  } catch (error) {
    toast.add({ title: '读取推送状态失败', description: getHsdataErrorMessage(error), color: 'error' });
  }
}

/** Displays the saved result and refreshes batch state after a successful task. */
function onCompleted(snapshot: TaskPageSnapshot) {
  pushResult.value = snapshot.result as unknown as TagPushReport ?? null;
  void refreshData();
}

/** Refreshes history after a failed run while leaving the task error visible. */
function onFailed() {
  void refreshData();
}

/** Shows a readable message if the task could not be created. */
function onCreateError(_key: string, message: string) {
  toast.add({ title: '无法开始推送', description: message, color: 'error' });
}

/** Formats persisted timestamps for the local user's locale. */
function formatTime(value: string) {
  return new Date(value).toLocaleString();
}

/** Maps one saved batch status to user-facing copy. */
function batchStatusLabel(status: string) {
  if (status === 'completed') return '完成';
  if (status === 'pushing') return '未完成';
  return '失败';
}

/** Maps one saved batch status to its visual emphasis. */
function batchStatusColor(status: string): 'success' | 'warning' | 'error' {
  if (status === 'completed') return 'success';
  if (status === 'pushing') return 'warning';
  return 'error';
}

watch(selectedEnvironment, value => {
  if (value) window.localStorage.setItem(TARGET_KEY, value);
});

onMounted(async () => {
  await Promise.all([loadTarget(), refreshData()]);
  await restoreTask();
});
</script>
