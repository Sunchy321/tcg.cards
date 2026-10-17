<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <UCard>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-upload" class="size-5 text-primary" />
          <h1 class="text-xl font-semibold">Magic 发布</h1>
        </div>
        <div class="flex items-center gap-3 text-xs">
          <template v-if="selectedPublishTarget">
            <span class="text-muted">magic</span>
            <span class="text-muted">·</span>
            <UDropdownMenu
              v-if="publishTargets.length > 1"
              :items="environmentItems"
              :content="{ align: 'end' }"
            >
              <button type="button" class="inline-flex items-center gap-1 text-muted transition-colors hover:text-default">
                {{ selectedPublishTarget.environment }}
                <UIcon name="i-lucide-chevron-down" class="size-3 opacity-70" />
              </button>
            </UDropdownMenu>
            <span v-else class="text-muted">{{ selectedPublishTarget.environment }}</span>
            <UBadge :label="shortFingerprint(selectedPublishTarget.targetFingerprint)" color="neutral" variant="soft" size="xs" />
          </template>
          <span v-else class="text-muted">未配置</span>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" @click="loadPublishTargets" />
        </div>
      </div>

      <UAlert
        v-if="!hasPublishTarget && publishTargetError.length === 0"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="未配置发布目标"
        description="请在 设置 → 发布配置 中为 Magic 添加发布环境。"
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
      title="Magic 发布"
      :operations="operations"
      @completed="onCompleted"
      @failed="onFailed"
      @create-error="onCreateError"
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
          <UCheckbox v-model="dryRun" label="Dry Run（只出计划，不写远端）" :disabled="disabled" />
          <UCheckbox v-model="force" label="Force（跳过远端门禁）" :disabled="disabled" />
        </div>
      </template>
    </TaskController>

    <TaskResultCard v-if="taskResult" :result="displayResult" :labels="RESULT_LABELS" />
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { getDesktopPublishTargets, type DesktopPublishTarget } from '~/composables/useDesktopSettings';
import { orpc } from '~/lib/orpc';

definePageMeta({
  layout: 'admin',
  title:  'Magic 发布',
});

const publishTargets = ref<DesktopPublishTarget[]>([]);
const selectedEnvironment = ref('');
const publishTargetError = ref('');
const dryRun = ref(false);
const force = ref(false);
const taskResult = ref<Record<string, unknown> | null>(null);

/** Product labels for the newly expanded reference-data publishing report. */
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
};
const displayResult = computed(() => {
  const result = taskResult.value;
  if (!result || !('setCount' in result)) return result;
  return { ...result, dryRun: result.dryRun ? '是' : '否' };
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

function shortFingerprint(fingerprint: string) {
  return fingerprint ? fingerprint.slice(0, 8) : '';
}

async function loadPublishTargets() {
  publishTargetError.value = '';
  try {
    const targets = await getDesktopPublishTargets();
    publishTargets.value = targets.filter(t => t.publishTarget === 'magic');
    if (!targets.some(t => t.environment === selectedEnvironment.value)) {
      selectedEnvironment.value = targets[0]?.environment ?? '';
    }
  } catch (error) {
    publishTargetError.value = error instanceof Error ? error.message : String(error);
  }
}

const publishTypes = [
  { label: '赛制、系列与补充包', value: 'reference' },
  { label: '数据发布', value: 'data' },
  { label: '公告发布', value: 'announcement' },
];
const PUBLISH_PAGE_STATE_KEY = 'console-desktop-magic-publish-page';
const PUBLISH_TYPE_VALUES = ['data', 'announcement', 'reference'];
const publishType = ref('data');

function restorePublishType() {
  try {
    const saved = window.localStorage.getItem(PUBLISH_PAGE_STATE_KEY);
    if (saved && PUBLISH_TYPE_VALUES.includes(saved)) publishType.value = saved;
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

watch(publishType, value => {
  try {
    window.localStorage.setItem(PUBLISH_PAGE_STATE_KEY, value);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
});

const operations: TaskOperation[] = [
  {
    key:    'publish',
    label:  '发布',
    icon:   'i-lucide-upload',
    create: async () => {
      const target = selectedPublishTarget.value;
      if (!target) throw new Error('未配置发布目标');
      if (publishType.value === 'announcement') {
        return orpc.magic.publish.announcementPublishTask({
          publishTarget: 'magic',
          environment:   target.environment,
          dryRun:        dryRun.value,
        }) as Promise<TaskPageSnapshot>;
      }
      if (publishType.value === 'reference') {
        return orpc.magic.publish.referencePublishTask({
          publishTarget: 'magic',
          environment:   target.environment,
          dryRun:        dryRun.value,
        }) as Promise<TaskPageSnapshot>;
      }
      return orpc.magic.publish.publishTask({
        publishTarget: 'magic',
        environment:   target.environment,
        dryRun:        dryRun.value,
        force:         force.value,
      }) as Promise<TaskPageSnapshot>;
    },
  },
];

function onCompleted(snap: TaskPageSnapshot) {
  taskResult.value = (snap.result as Record<string, unknown> | undefined) ?? null;
}
function onFailed() {}
function onCreateError() {}

onMounted(() => {
  restorePublishType();
  void loadPublishTargets();
});
</script>
