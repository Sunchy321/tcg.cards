<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">影之诗</h1>
          </div>
          <p class="mt-1 text-sm text-muted">超凡世界（数字版）与进化对决（实体 TCG）的卡牌数据与卡图导入。</p>
        </div>
        <div class="ml-auto flex gap-2">
          <UButton label="刷新任务" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" @click="refreshTasks" />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 pt-2">
      <h2 class="text-base font-semibold">超凡世界（Beyond）</h2>
      <span class="text-xs text-muted">来源：官方 Deck Portal，覆盖日/英/简中/繁中/韩</span>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <TaskController
        ref="cardsController"
        title="卡牌数据导入"
        :operations="[cardsImportOperation]"
        @completed="onCardsCompleted"
      >
        <template #params>
          <div class="space-y-2 pt-4">
            <div class="font-medium">全量卡牌数据</div>
            <p class="text-xs text-muted">
              从官方卡牌列表更新卡牌资料（含衍生物）；未变化的卡牌会自动跳过。
            </p>
          </div>
        </template>
      </TaskController>

      <TaskController
        ref="imagesController"
        title="卡图导入"
        :operations="[imagesImportOperation]"
        @completed="onImagesCompleted"
      >
        <template #params>
          <div class="space-y-2 pt-4">
            <div class="font-medium">全量卡图下载</div>
            <p class="text-xs text-muted">
              按五种语言下载卡面图与横幅图；已存在的图片会自动跳过。
            </p>
          </div>
        </template>
      </TaskController>
    </div>

    <div class="flex items-center gap-2 pt-4">
      <h2 class="text-base font-semibold">进化对决（Evolve）</h2>
      <span class="text-xs text-muted">来源：官方卡牌资料（日/英）和社区简中数据（SVE Helper）</span>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <TaskController
        ref="evolveCardsController"
        title="卡牌数据导入"
        :operations="[evolveCardsImportOperation]"
        @completed="onEvolveCardsCompleted"
      >
        <template #params>
          <div class="space-y-2 pt-4">
            <div class="font-medium">全量卡牌数据</div>
            <p class="text-xs text-muted">
              更新卡牌能力、风味、画师和官方问答，并合并简中资料。首次完整导入可能需要 2–3 小时。
            </p>
          </div>
        </template>
      </TaskController>

      <TaskController
        ref="evolveImagesController"
        title="卡图导入"
        :operations="[evolveImagesImportOperation]"
        @completed="onEvolveImagesCompleted"
      >
        <template #params>
          <div class="space-y-2 pt-4">
            <div class="font-medium">全量卡图下载</div>
            <p class="text-xs text-muted">
              按日/英两种语言下载卡面图；已存在的图片会自动跳过。
            </p>
          </div>
        </template>
      </TaskController>
    </div>

    <UCard v-if="cardsResult">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-medium">Beyond 卡牌导入报告</span>
          <UBadge
            :label="cardsResult.status === 'completed' ? 'Success' : 'With errors'"
            :color="cardsResult.status === 'completed' ? 'success' : 'warning'"
            variant="soft"
          />
        </div>
      </template>
      <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">卡牌总数</div>
          <div class="mt-1 font-mono text-sm">{{ cardsResult.cardCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">新增</div>
          <div class="mt-1 font-mono text-sm">{{ cardsResult.addedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">更新</div>
          <div class="mt-1 font-mono text-sm">{{ cardsResult.updatedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">跳过</div>
          <div class="mt-1 font-mono text-sm">{{ cardsResult.skippedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">失败</div>
          <div class="mt-1 font-mono text-sm">{{ cardsResult.failedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">软删除</div>
          <div class="mt-1 font-mono text-sm">{{ cardsResult.softDeletedCount }}</div>
        </div>
      </div>
    </UCard>

    <UCard v-if="imagesResult">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-medium">Beyond 卡图导入报告</span>
          <UBadge
            :label="imagesResult.status === 'completed' ? 'Success' : 'With errors'"
            :color="imagesResult.status === 'completed' ? 'success' : 'warning'"
            variant="soft"
          />
        </div>
      </template>
      <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">资产总数</div>
          <div class="mt-1 font-mono text-sm">{{ imagesResult.assetCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">下载</div>
          <div class="mt-1 font-mono text-sm">{{ imagesResult.downloadedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">跳过</div>
          <div class="mt-1 font-mono text-sm">{{ imagesResult.skippedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">缺失</div>
          <div class="mt-1 font-mono text-sm">{{ imagesResult.missingCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">失败</div>
          <div class="mt-1 font-mono text-sm">{{ imagesResult.failedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">下载量</div>
          <div class="mt-1 font-mono text-sm">{{ formatBytes(imagesResult.downloadedByteCount) }}</div>
        </div>
      </div>
    </UCard>

    <UCard v-if="evolveCardsResult">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-medium">Evolve 卡牌导入报告</span>
          <UBadge
            :label="evolveCardsResult.status === 'completed' ? 'Success' : 'With errors'"
            :color="evolveCardsResult.status === 'completed' ? 'success' : 'warning'"
            variant="soft"
          />
        </div>
      </template>
      <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">卡牌总数</div>
          <div class="mt-1 font-mono text-sm">{{ evolveCardsResult.cardCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">新增</div>
          <div class="mt-1 font-mono text-sm">{{ evolveCardsResult.addedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">更新</div>
          <div class="mt-1 font-mono text-sm">{{ evolveCardsResult.updatedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">跳过</div>
          <div class="mt-1 font-mono text-sm">{{ evolveCardsResult.skippedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">失败</div>
          <div class="mt-1 font-mono text-sm">{{ evolveCardsResult.failedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">软删除</div>
          <div class="mt-1 font-mono text-sm">{{ evolveCardsResult.softDeletedCount }}</div>
        </div>
      </div>
    </UCard>

    <UCard v-if="evolveImagesResult">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="font-medium">Evolve 卡图导入报告</span>
          <UBadge
            :label="evolveImagesResult.status === 'completed' ? 'Success' : 'With errors'"
            :color="evolveImagesResult.status === 'completed' ? 'success' : 'warning'"
            variant="soft"
          />
        </div>
      </template>
      <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">资产总数</div>
          <div class="mt-1 font-mono text-sm">{{ evolveImagesResult.assetCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">下载</div>
          <div class="mt-1 font-mono text-sm">{{ evolveImagesResult.downloadedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">跳过</div>
          <div class="mt-1 font-mono text-sm">{{ evolveImagesResult.skippedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">缺失</div>
          <div class="mt-1 font-mono text-sm">{{ evolveImagesResult.missingCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">失败</div>
          <div class="mt-1 font-mono text-sm">{{ evolveImagesResult.failedCount }}</div>
        </div>
        <div class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">下载量</div>
          <div class="mt-1 font-mono text-sm">{{ formatBytes(evolveImagesResult.downloadedByteCount) }}</div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { TaskPageSnapshot } from '@tcg-cards/model/task';
import type { TaskOperation } from '~/components/task/TaskController.vue';
import { useTasks } from '~/composables/useTasks';
import { startDesktopTask } from '~/lib/orpc';

definePageMeta({
  layout: 'admin',
  title:  '影之诗',
});

/** Card-import counters displayed after one task completes. */
interface CardsImportResult {
  cardCount:        number;
  status:           string;
  addedCount:       number;
  updatedCount:     number;
  skippedCount:     number;
  failedCount:      number;
  softDeletedCount: number;
}

/** Image-import counters displayed after one task completes. */
interface ImagesImportResult {
  assetCount:          number;
  status:              string;
  downloadedCount:     number;
  skippedCount:        number;
  missingCount:        number;
  failedCount:         number;
  downloadedByteCount: number;
}

/** Task card API used to restore a persisted run. */
interface PageTaskController {
  attach(snapshot: TaskPageSnapshot): void;
}

const taskTypes = {
  cards:        'shadowverse_cards_import',
  images:       'shadowverse_images_import',
  evolveCards:  'shadowverse_evolve_cards_import',
  evolveImages: 'shadowverse_evolve_images_import',
} as const;

const taskStore = useTasks();
const cardsResult = ref<CardsImportResult | null>(null);
const imagesResult = ref<ImagesImportResult | null>(null);
const evolveCardsResult = ref<CardsImportResult | null>(null);
const evolveImagesResult = ref<ImagesImportResult | null>(null);
const cardsController = ref<PageTaskController | null>(null);
const imagesController = ref<PageTaskController | null>(null);
const evolveCardsController = ref<PageTaskController | null>(null);
const evolveImagesController = ref<PageTaskController | null>(null);

const cardsImportOperation = computed<TaskOperation>(() => ({
  key:      'cards_import',
  taskType: taskTypes.cards,
  label:    '执行导入',
  icon:     'i-lucide-play',
  create:   () => startDesktopTask(taskTypes.cards, {}),
}));

const imagesImportOperation = computed<TaskOperation>(() => ({
  key:      'images_import',
  taskType: taskTypes.images,
  label:    '执行下载',
  icon:     'i-lucide-play',
  create:   () => startDesktopTask(taskTypes.images, {}),
}));

const evolveCardsImportOperation = computed<TaskOperation>(() => ({
  key:      'evolve_cards_import',
  taskType: taskTypes.evolveCards,
  label:    '执行导入',
  icon:     'i-lucide-play',
  create:   () => startDesktopTask(taskTypes.evolveCards, {}),
}));

const evolveImagesImportOperation = computed<TaskOperation>(() => ({
  key:      'evolve_images_import',
  taskType: taskTypes.evolveImages,
  label:    '执行下载',
  icon:     'i-lucide-play',
  create:   () => startDesktopTask(taskTypes.evolveImages, {}),
}));

/** Copies completed card-import totals into the visible report. */
function onCardsCompleted(snapshot: TaskPageSnapshot) {
  cardsResult.value = (snapshot.result ?? null) as CardsImportResult | null;
}

/** Copies completed image-import totals into the visible report. */
function onImagesCompleted(snapshot: TaskPageSnapshot) {
  imagesResult.value = (snapshot.result ?? null) as ImagesImportResult | null;
}

/** Copies completed Evolve card-import totals into the visible report. */
function onEvolveCardsCompleted(snapshot: TaskPageSnapshot) {
  evolveCardsResult.value = (snapshot.result ?? null) as CardsImportResult | null;
}

/** Copies completed Evolve image-import totals into the visible report. */
function onEvolveImagesCompleted(snapshot: TaskPageSnapshot) {
  evolveImagesResult.value = (snapshot.result ?? null) as ImagesImportResult | null;
}

/** Resolves the task card controller registered for one task type. */
function controllerFor(taskType: string): PageTaskController | null {
  if (taskType === taskTypes.cards) {
    return cardsController.value;
  }
  if (taskType === taskTypes.images) {
    return imagesController.value;
  }
  if (taskType === taskTypes.evolveCards) {
    return evolveCardsController.value;
  }
  if (taskType === taskTypes.evolveImages) {
    return evolveImagesController.value;
  }
  return null;
}

/** Restores the latest task state and report for one source. */
function attachLatestTask(taskType: string) {
  const task = taskStore.taskOfType(taskType);
  const snapshot = task?.pageSnapshot;
  const controller = controllerFor(taskType);

  if (!task || !snapshot || snapshot.pageTask.kind !== 'attached' || !controller) {
    return;
  }

  controller.attach(snapshot);

  if (task.status !== 'completed') {
    return;
  }

  if (taskType === taskTypes.cards) {
    onCardsCompleted(snapshot);
  }
  if (taskType === taskTypes.images) {
    onImagesCompleted(snapshot);
  }
  if (taskType === taskTypes.evolveCards) {
    onEvolveCardsCompleted(snapshot);
  }
  if (taskType === taskTypes.evolveImages) {
    onEvolveImagesCompleted(snapshot);
  }
}

/** Refreshes persisted task snapshots and restores all four task cards. */
async function refreshTasks() {
  const types = Object.values(taskTypes);
  await taskStore.refresh([...types]);

  for (const taskType of types) {
    attachLatestTask(taskType);
  }
}

/** Formats a byte count for the image-import report. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}

onMounted(() => void refreshTasks());
</script>
