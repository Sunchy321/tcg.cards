<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <UCard>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-upload" class="size-5 text-primary" />
          <h1 class="text-xl font-semibold">万智牌发布</h1>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <template v-if="selectedPublishTarget">
            <span class="text-muted">万智牌</span>
            <span class="text-muted">·</span>
            <UDropdownMenu
              v-if="publishTargets.length > 1"
              :items="environmentItems"
              :content="{ align: 'end' }"
            >
              <button type="button" :disabled="targetLocked" class="inline-flex items-center gap-1 text-muted transition-colors hover:text-default disabled:cursor-not-allowed">
                {{ selectedPublishTarget.environment }}
                <UIcon name="i-lucide-chevron-down" class="size-3 opacity-70" />
              </button>
            </UDropdownMenu>
            <span v-else class="text-muted">{{ selectedPublishTarget.environment }}</span>
            <UBadge :label="shortFingerprint(selectedPublishTarget.targetFingerprint)" color="neutral" variant="soft" size="xs" />
          </template>
          <span v-else class="text-muted">未配置</span>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" :disabled="targetLocked" @click="loadPublishTargets" />
        </div>
      </div>

      <UAlert
        v-if="!hasPublishTarget && publishTargetError.length === 0"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="未配置发布目标"
        description="请在 设置 → 发布配置 中为万智牌添加发布环境。"
        class="mt-2"
      />
      <UAlert
        v-if="publishTargetError.length > 0"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="加载发布目标失败"
        :description="publishTargetError"
        class="mt-2"
      />
    </UCard>

    <TaskController
      ref="controller"
      title="万智牌发布"
      :operations="operations"
      @completed="onCompleted"
      @failed="onFailed"
      @create-error="onCreateError"
      @status-change="onStatusChange"
      @snapshot="onSnapshot"
    >
      <template #params="{ disabled }">
        <div class="flex items-center gap-6">
          <UFormField label="发布类型" orientation="horizontal">
            <USelect
              v-model="publishType"
              :items="publishTypes"
              :disabled="disabled"
              option-attribute="label"
              class="w-64"
            />
          </UFormField>
          <UCheckbox v-model="dryRun" label="仅预览，不写入远端" :disabled="disabled" />
          <UCheckbox v-if="publishType === 'data'" v-model="force" label="忽略远端版本检查" :disabled="disabled" />
        </div>
      </template>
    </TaskController>

    <UAlert v-if="publishError" color="error" title="发布失败" :description="publishError" />
    <TaskResultCard v-if="taskResult" title="发布报告" :result="displayResult" :labels="RESULT_LABELS" />
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot, TaskRunStatus } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { getDesktopPublishTargets, type DesktopPublishTarget } from '~/composables/useDesktopSettings';
import { getDesktopTaskSnapshot, startDesktopTask } from '~/lib/orpc';

definePageMeta({
  layout: 'admin',
  title:  '万智牌发布',
});

const publishTargets = ref<DesktopPublishTarget[]>([]);
const selectedEnvironment = ref('');
const publishTargetError = ref('');
const dryRun = ref(false);
const force = ref(false);
const taskResult = ref<Record<string, unknown> | null>(null);
const targetLocked = ref(false);
const publishError = ref('');

/** Product labels for the reference-data publishing report. */
const RESULT_LABELS: Record<string, string> = {
  formatCount:       '赛制',
  setCount:          '系列',
  localizationCount: '系列译名',
  boosterCount:      '补充包类型',
  sheetCount:        '卡池',
  sheetCardCount:    '卡池中的卡牌',
  packCount:         '配包组合',
  packContentCount:  '配包内容',
  totalRowCount:     '数据总数',
  changedRowCount:   '本次发布数量',
  dryRun:            '仅预览',
  environment:       '发布环境',
  force:             '忽略版本检查',
  announcementCount: '公告',
  itemCount:         '公告条目',
  documents:         '文章',
  translations:      '译文',
  revisions:         '保存版本',
  nodes:             '文档条目',
  releases:          '正式版本',
};
const displayResult = computed(() => {
  const result = taskResult.value;
  if (!result) return null;
  return Object.fromEntries(Object.entries(result)
    .filter(([key]) => key in RESULT_LABELS || key === 'counts')
    .map(([key, value]) => [key, key === 'dryRun' || key === 'force' ? (value ? '是' : '否') : value]));
});

const controller = ref<{ attach(snapshot: TaskPageSnapshot): void, currentTaskRunId: string | null }>();

const environmentItems = computed(() =>
  publishTargets.value.map(target => ({
    label:    target.environment,
    value:    target.environment,
    onSelect: () => {
      selectedEnvironment.value = target.environment;
    },
  })));

const selectedPublishTarget = computed<DesktopPublishTarget | null>(() =>
  publishTargets.value.find(target => target.environment === selectedEnvironment.value) ?? null);

const hasPublishTarget = computed(() => selectedPublishTarget.value != null);

/** Abbreviates the configured target identity in the existing destination header. */
function shortFingerprint(fingerprint: string | null) {
  return fingerprint ? fingerprint.slice(0, 8) : '';
}

/** Loads configured Magic destinations without selecting another game's environment. */
async function loadPublishTargets() {
  publishTargetError.value = '';
  try {
    const targets = await getDesktopPublishTargets();
    publishTargets.value = targets.filter(t => t.publishTarget === 'magic');
    if (!publishTargets.value.some(t => t.environment === selectedEnvironment.value)) {
      selectedEnvironment.value = publishTargets.value[0]?.environment ?? '';
    }
  } catch (error) {
    publishTargetError.value = error instanceof Error ? error.message : String(error);
  }
}

const publishTypes = [
  { label: '赛制、系列与补充包', value: 'reference' },
  { label: '卡牌数据', value: 'data' },
  { label: '公告发布', value: 'announcement' },
  { label: '静态文档发布', value: 'document' },
];
const PUBLISH_PAGE_STATE_KEY = 'console-desktop-magic-publish-page';
const PUBLISH_TYPE_VALUES = ['data', 'reference', 'announcement', 'document'];
const publishType = ref('data');
let persistedTaskRunId: string | null = null;
const route = useRoute();

/** Restores the selected publication category and the task shown on this page. */
function restorePublishType() {
  if (route.query.type === 'document') {
    publishType.value = 'document';
    return;
  }
  try {
    const saved = window.localStorage.getItem(PUBLISH_PAGE_STATE_KEY);
    if (!saved) return;
    const state = JSON.parse(saved) as { publishType?: string, environment?: string, dryRun?: boolean, force?: boolean, taskRunId?: string };
    if (state.publishType && PUBLISH_TYPE_VALUES.includes(state.publishType)) publishType.value = state.publishType;
    if (typeof state.environment === 'string') selectedEnvironment.value = state.environment;
    if (typeof state.dryRun === 'boolean') dryRun.value = state.dryRun;
    if (typeof state.force === 'boolean') force.value = state.force;
    persistedTaskRunId = typeof state.taskRunId === 'string' ? state.taskRunId : null;
  } catch {
    window.localStorage.removeItem(PUBLISH_PAGE_STATE_KEY);
  }
}

function persistPublishPageState() {
  try {
    window.localStorage.setItem(PUBLISH_PAGE_STATE_KEY, JSON.stringify({
      publishType: publishType.value,
      environment: selectedEnvironment.value,
      dryRun:      dryRun.value,
      force:       force.value,
      taskRunId:   persistedTaskRunId,
    }));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

watch([publishType, selectedEnvironment, dryRun, force], persistPublishPageState);

const operations: TaskOperation[] = [
  {
    key:    'publish',
    label:  '发布',
    icon:   'i-lucide-upload',
    create: async () => {
      taskResult.value = null;
      publishError.value = '';
      const target = selectedPublishTarget.value;
      if (!target) throw new Error('未配置发布目标');
      targetLocked.value = true;
      if (publishType.value === 'announcement') {
        return startDesktopTask('magic_announcement_publish', {
          publishTarget: 'magic',
          environment:   target.environment,
          dryRun:        dryRun.value,
        });
      }
      if (publishType.value === 'document') {
        return startDesktopTask('magic_document_publish', {
          publishTarget:     target.publishTarget,
          environment:       target.environment,
          targetFingerprint: target.targetFingerprint,
          dryRun:            dryRun.value,
        });
      }
      if (publishType.value === 'reference') {
        return startDesktopTask('magic_reference_publish', {
          publishTarget: 'magic',
          environment:   target.environment,
          dryRun:        dryRun.value,
        });
      }
      return startDesktopTask('magic_publish', {
        publishTarget: 'magic',
        environment:   target.environment,
        dryRun:        dryRun.value,
        force:         force.value,
      });
    },
  },
];

/** Shows the completed publication report and allows another destination selection. */
function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
  publishError.value = '';
  targetLocked.value = false;
}
/** Shows task failures without discarding the task's retry controls. */
function onFailed(_taskRunId: string, _code: string | null, message: string | null) {
  publishError.value = message ?? '发布失败，请重试。';
  targetLocked.value = false;
}
/** Shows failures that occurred before a publication task was created. */
function onCreateError(_key: string, message: string) {
  publishError.value = message;
  targetLocked.value = false;
}
/** Keeps the visible destination fixed while a task can still write or resume. */
function onStatusChange(status: TaskRunStatus) {
  targetLocked.value = !['completed', 'failed', 'canceled', 'abandoned'].includes(status);
}

/** Restores a retried document publication's original destination in the visible controls. */
function onSnapshot(snapshot: TaskPageSnapshot) {
  if (snapshot.pageTask.kind !== 'attached') return;
  const typeByTask: Record<string, string> = {
    magic_publish:              'data',
    magic_reference_publish:    'reference',
    magic_announcement_publish: 'announcement',
    magic_document_publish:     'document',
  };
  const restoredType = typeByTask[snapshot.pageTask.taskType];
  if (!restoredType) return;
  persistedTaskRunId = snapshot.pageTask.taskRunId;
  publishType.value = restoredType;
  const environment = snapshot.pageTask.taskScopeSnapshot?.environment;
  if (typeof environment === 'string') selectedEnvironment.value = environment;
  persistPublishPageState();
  onStatusChange(snapshot.pageTask.status);
  if (targetLocked.value) {
    publishError.value = '';
    taskResult.value = null;
  }
}

onMounted(async () => {
  restorePublishType();
  await loadPublishTargets();
  if (persistedTaskRunId) {
    try {
      const snapshot = await getDesktopTaskSnapshot(persistedTaskRunId);
      if (snapshot?.pageTask.kind === 'attached') {
        controller.value?.attach(snapshot);
        onSnapshot(snapshot);
        if (snapshot.pageTask.status === 'completed') onCompleted(snapshot);
        else if (snapshot.pageTask.status === 'failed') onFailed(snapshot.pageTask.taskRunId, snapshot.pageTask.errorCode, snapshot.pageTask.errorMessage);
      }
    } catch {
      persistedTaskRunId = null;
      persistPublishPageState();
    }
  }
});
</script>
