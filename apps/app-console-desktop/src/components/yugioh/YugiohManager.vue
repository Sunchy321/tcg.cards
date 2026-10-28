<template>
  <div class="space-y-4">
    <UAlert v-if="loadError" color="error" variant="soft" :description="loadError" />

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="font-medium">卡牌数据导入</h2>
            <p class="mt-1 text-xs text-muted">从百鸽获取结构化卡牌资料。</p>
          </div>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
        </div>
      </template>
      <div class="space-y-4">
        <p class="break-all rounded-lg border border-default bg-elevated/40 p-3 font-mono text-xs">
          {{ sourceInfo?.url ?? 'https://ygocdb.com/api/v0/cards.zip' }}
        </p>
        <TaskController
          ref="importController"
          title="卡牌数据导入"
          :operations="[importOperation]"
          @completed="onImportCompleted"
          @snapshot="snapshot => rememberTask(snapshot, importTaskType)"
        />
        <div v-if="latestImport" class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-medium">最近导入 · {{ formatDate(latestImport.completedAt ?? latestImport.startedAt) }}</span>
            <UBadge :label="statusLabel(latestImport.status)" :color="statusColor(latestImport.status)" variant="soft" />
          </div>
          <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div v-for="item in importStats" :key="item.label" class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">{{ item.label }}</div>
              <div class="mt-1 text-xl font-semibold">{{ item.value }}</div>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-muted">尚未执行导入。</p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="font-medium">主卡图导入</h2>
            <p class="mt-1 text-xs text-muted">使用 YGOPRO WebP 卡图；完整导入预计下载约 1.90 GiB。</p>
          </div>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
        </div>
      </template>
      <div class="space-y-4">
        <p class="break-all rounded-lg border border-default bg-elevated/40 p-3 font-mono text-xs">
          {{ imageSourceInfo?.metadataUrl ?? 'https://cdn.233.momobako.com/ygoimg/ygopro/metadata' }}
        </p>
        <UAlert v-if="!hasImageBucket" color="warning" variant="soft" description="请先在上方设置卡牌图片目录。" />
        <TaskController
          ref="imageController"
          title="主卡图导入"
          :operations="[imageOperation]"
          @completed="onImageCompleted"
          @snapshot="snapshot => rememberTask(snapshot, imageTaskType)"
        />
        <div v-if="latestImageImport" class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-medium">最近卡图导入 · {{ formatDate(latestImageImport.completedAt ?? latestImageImport.startedAt) }}</span>
            <UBadge :label="statusLabel(latestImageImport.status)" :color="statusColor(latestImageImport.status)" variant="soft" />
          </div>
          <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <div v-for="item in imageStats" :key="item.label" class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">{{ item.label }}</div>
              <div class="mt-1 text-xl font-semibold">{{ item.value }}</div>
            </div>
          </div>
          <p class="text-xs text-muted">本次下载：{{ formatBytes(latestImageImport.downloadedByteCount) }}</p>
        </div>
        <p v-else class="text-sm text-muted">尚未执行卡图导入。</p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h2 class="font-medium">测试环境发布</h2>
            <p class="mt-1 text-xs text-muted">发布前会确认目标与范围，并检查当前账号的发布权限。</p>
          </div>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loading" @click="load" />
        </div>
      </template>
      <div class="space-y-4">
        <div v-if="publishTarget" class="rounded-lg border border-default bg-elevated/40 p-3 text-sm">
          <span class="text-muted">发布目标：</span>{{ publishTarget.publishTargetId }}
          <span class="mx-2 text-muted">·</span>
          <span>测试环境</span>
        </div>
        <UAlert
          v-else
          color="warning"
          variant="soft"
          title="尚未配置测试发布目标"
          description="请先配置游戏王发布连接，再开始发布。"
        />
        <TaskController
          ref="publishController"
          title="卡牌数据发布"
          :operations="[publishOperation]"
          @completed="onPublishCompleted"
          @snapshot="snapshot => rememberTask(snapshot, publishTaskType)"
        />
        <div v-if="latestPublish" class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm font-medium">最近发布 · {{ formatDate(latestPublish.completedAt ?? latestPublish.createdAt) }}</span>
            <UBadge :label="publishStatusLabel(latestPublish.status)" :color="publishStatusColor(latestPublish.status)" variant="soft" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div v-for="item in publishStats" :key="item.label" class="rounded-lg border border-default p-3">
              <div class="text-xs text-muted">{{ item.label }}</div>
              <div class="mt-1 text-xl font-semibold">{{ item.value }}</div>
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-muted">尚未向当前测试目标发布。</p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-medium">官方资料抓取</h2>
      </template>
      <div class="flex flex-wrap gap-2">
        <UButton label="Neuron 官方库" icon="i-lucide-globe" color="neutral" variant="soft" to="/yugioh/data-source/neuron" />
        <UButton label="CNOCG 官方库" icon="i-lucide-globe" color="neutral" variant="soft" to="/yugioh/data-source/cnocg" />
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import type { TaskView } from '../../../electron/contract';
import { useDesktopSettings } from '~/composables/useDesktopSettings';
import { useTasks } from '~/composables/useTasks';
import { getDesktopTaskSnapshot, startDesktopTask, orpc } from '~/lib/orpc';

defineOptions({ name: 'YugiohManager' });

const importTaskType = 'yugioh_cards_import';
const imageTaskType = 'yugioh_image_import';
const publishTaskType = 'yugioh_publish';
const workflowTaskTypes = [importTaskType, imageTaskType, publishTaskType, 'yugioh_cnocg_import', 'yugioh_neuron_import'];
const importController = ref<{ attach(snapshot: TaskPageSnapshot): void } | null>(null);
const imageController = ref<{ attach(snapshot: TaskPageSnapshot): void } | null>(null);
const publishController = ref<{ attach(snapshot: TaskPageSnapshot): void } | null>(null);
const { snapshot: settingsSnapshot } = useDesktopSettings();
const taskStore = useTasks();
const loading = ref(false);
const loadError = ref('');
const sourceInfo = ref<Awaited<ReturnType<typeof orpc.yugioh.sourceInfo>> | null>(null);
const imageSourceInfo = ref<Awaited<ReturnType<typeof orpc.yugioh.imageSourceInfo>> | null>(null);
const importState = ref<Awaited<ReturnType<typeof orpc.yugioh.getImportState>> | null>(null);
const imageState = ref<Awaited<ReturnType<typeof orpc.yugioh.getImageImportState>> | null>(null);
const publishState = ref<Awaited<ReturnType<typeof orpc.yugioh.getPublishState>> | null>(null);

const latestImport = computed(() => importState.value?.latest ?? null);
const latestImageImport = computed(() => imageState.value?.latest ?? null);
const latestPublish = computed(() => publishState.value?.batches[0] ?? null);
const hasImageBucket = computed(() => Boolean(settingsSnapshot.value?.config.games.yugioh?.image?.bucketDir));
const publishTarget = computed(() => {
  const target = settingsSnapshot.value?.config.games.yugioh?.publish;
  const configured = settingsSnapshot.value?.credentials['yugioh-publish'] ?? false;
  return target && target.environment === 'test' && configured ? target : null;
});

function isBlockedByOtherTask(taskType: string) {
  return taskStore.active.value.some((task: TaskView) => workflowTaskTypes.includes(task.taskType) && task.taskType !== taskType);
}

const importOperation = computed<TaskOperation>(() => ({
  key:      'cards-import',
  taskType: importTaskType,
  label:    '下载并导入',
  icon:     'i-lucide-download',
  disabled: isBlockedByOtherTask(importTaskType),
  create:   () => startDesktopTask(importTaskType, {}),
}));

const imageOperation = computed<TaskOperation>(() => ({
  key:      'image-import',
  taskType: imageTaskType,
  label:    '下载并导入卡图',
  icon:     'i-lucide-images',
  disabled: !hasImageBucket.value || isBlockedByOtherTask(imageTaskType),
  create:   () => startDesktopTask(imageTaskType, {}),
}));

const publishOperation = computed<TaskOperation>(() => ({
  key:      'publish',
  taskType: publishTaskType,
  label:    '发布到测试目标',
  icon:     'i-lucide-upload',
  disabled: !publishTarget.value || isBlockedByOtherTask(publishTaskType),
  create:   () => startDesktopTask(publishTaskType, {}),
}));

const importStats = computed(() => [
  { label: '新增', value: latestImport.value?.addedCount ?? 0 },
  { label: '更新', value: latestImport.value?.updatedCount ?? 0 },
  { label: '跳过', value: latestImport.value?.skippedCount ?? 0 },
  { label: '失败', value: latestImport.value?.failedCount ?? 0 },
  { label: '已移除', value: latestImport.value?.softDeletedCount ?? 0 },
]);

const imageStats = computed(() => [
  { label: '新增', value: latestImageImport.value?.addedCount ?? 0 },
  { label: '更新', value: latestImageImport.value?.updatedCount ?? 0 },
  { label: '跳过', value: latestImageImport.value?.skippedCount ?? 0 },
  { label: '失败', value: latestImageImport.value?.failedCount ?? 0 },
  { label: '无可用图', value: latestImageImport.value?.missingCount ?? 0 },
  { label: '已移除', value: latestImageImport.value?.softDeletedCount ?? 0 },
]);

const publishStats = computed(() => [
  { label: '总数', value: latestPublish.value?.totalRowCount ?? 0 },
  { label: '变更', value: latestPublish.value?.changedRowCount ?? 0 },
  { label: '新增', value: latestPublish.value?.insertedRowCount ?? 0 },
  { label: '更新', value: latestPublish.value?.updatedRowCount ?? 0 },
]);

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

function statusLabel(value: string) {
  return ({ completed: '已完成', completed_with_errors: '部分失败', failed: '失败', interrupted: '已中断', running: '进行中' } as Record<string, string>)[value] ?? value;
}

function statusColor(value: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (value === 'completed') return 'success';
  if (value === 'completed_with_errors') return 'warning';
  if (value === 'failed') return 'error';
  return 'neutral';
}

function publishStatusLabel(value: string) {
  return ({ completed: '已完成', failed: '失败', applying: '正在写入', planning: '正在准备' } as Record<string, string>)[value] ?? value;
}

function publishStatusColor(value: string): 'success' | 'error' | 'neutral' {
  if (value === 'completed') return 'success';
  if (value === 'failed') return 'error';
  return 'neutral';
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [source, imageSource, imports, images, publishes, settings] = await Promise.all([
      orpc.yugioh.sourceInfo(),
      orpc.yugioh.imageSourceInfo(),
      orpc.yugioh.getImportState(),
      orpc.yugioh.getImageImportState(),
      orpc.yugioh.getPublishState(),
      window.desktop.settings.read(),
    ]);
    sourceInfo.value = source;
    imageSourceInfo.value = imageSource;
    importState.value = imports;
    imageState.value = images;
    publishState.value = publishes;
    settingsSnapshot.value = settings;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '无法读取游戏王资料。';
  } finally {
    loading.value = false;
  }
}

function rememberTask(snapshot: TaskPageSnapshot, taskType: string) {
  if (snapshot.pageTask.kind !== 'attached' || snapshot.pageTask.taskType !== taskType) return;
  window.localStorage.setItem(`console-desktop-${taskType}-task`, snapshot.pageTask.taskRunId);
}

async function restoreTask(taskType: string, controller: { attach(snapshot: TaskPageSnapshot): void } | null) {
  const id = window.localStorage.getItem(`console-desktop-${taskType}-task`);
  if (id) {
    const snapshot = await getDesktopTaskSnapshot(id).catch(() => null);
    if (snapshot?.pageTask.kind === 'attached' && snapshot.pageTask.taskType === taskType) {
      controller?.attach(snapshot);
      return;
    }
    window.localStorage.removeItem(`console-desktop-${taskType}-task`);
  }
  const task = taskStore.taskOfType(taskType);
  if (task?.pageSnapshot) controller?.attach(task.pageSnapshot);
}

async function onImportCompleted() {
  await load();
}
async function onImageCompleted() {
  await load();
}
async function onPublishCompleted() {
  await load();
}

onMounted(async () => {
  await load();
  await taskStore.refresh(workflowTaskTypes);
  await Promise.all([
    restoreTask(importTaskType, importController.value),
    restoreTask(imageTaskType, imageController.value),
    restoreTask(publishTaskType, publishController.value),
  ]);
});
</script>
