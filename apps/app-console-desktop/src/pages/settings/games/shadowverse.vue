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
          <UButton label="刷新任务" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" @click="refreshKey++" />
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2 pt-2">
      <h2 class="text-base font-semibold">超凡世界（Beyond）</h2>
      <span class="text-xs text-muted">来源：官方 Deck Portal 接口，覆盖日/英/简中/繁中/韩</span>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <TaskController
        :key="`cards-${refreshKey}`"
        title="卡牌数据导入"
        :operations="[cardsImportOperation]"
        @completed="onCardsCompleted"
      >
        <template #params>
          <div class="space-y-2 pt-4">
            <div class="font-medium">全量卡牌数据</div>
            <p class="text-xs text-muted">
              拉取官方卡牌列表（含衍生物），幂等写入本地数据库。已存在且未变化的卡牌会自动跳过。
            </p>
          </div>
        </template>
      </TaskController>

      <TaskController
        :key="`images-${refreshKey}`"
        title="卡图导入"
        :operations="[imagesImportOperation]"
        @completed="onImagesCompleted"
      >
        <template #params>
          <div class="space-y-2 pt-4">
            <div class="font-medium">全量卡图下载</div>
            <p class="text-xs text-muted">
              按五种语言下载卡面图与横幅图到本地 bucket 目录（data/shadowverse/images），文件名即资源 hash，未变化的文件自动跳过。
            </p>
          </div>
        </template>
      </TaskController>
    </div>

    <div class="flex items-center gap-2 pt-4">
      <h2 class="text-base font-semibold">进化对决（Evolve）</h2>
      <span class="text-xs text-muted">来源：官方卡牌列表（日/英）+ 社区简中数据（SVE Helper）</span>
    </div>

    <div class="grid gap-4 xl:grid-cols-2">
      <TaskController
        :key="`evolve-cards-${refreshKey}`"
        title="卡牌数据导入"
        :operations="[evolveCardsImportOperation]"
        @completed="onEvolveCardsCompleted"
      >
        <template #params>
          <div class="space-y-2 pt-4">
            <div class="font-medium">全量卡牌数据</div>
            <p class="text-xs text-muted">
              枚举官方卡牌目录后逐卡抓取详情（能力、风味、画师、官方 Q&A），合并简中翻译，幂等写入本地数据库。首次全量约需 2-3 小时。
            </p>
          </div>
        </template>
      </TaskController>

      <TaskController
        :key="`evolve-images-${refreshKey}`"
        title="卡图导入"
        :operations="[evolveImagesImportOperation]"
        @completed="onEvolveImagesCompleted"
      >
        <template #params>
          <div class="space-y-2 pt-4">
            <div class="font-medium">全量卡图下载</div>
            <p class="text-xs text-muted">
              按日/英两种语言下载卡面图到本地 bucket 目录（data/shadowverse-evolve/images），已存在的文件自动跳过。
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
import { orpc } from '~/lib/orpc';

definePageMeta({
  layout: 'admin',
  title:  '影之诗',
});

interface CardsImportResult {
  cardCount: number;
  status: string;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  softDeletedCount: number;
}

interface ImagesImportResult {
  assetCount: number;
  status: string;
  downloadedCount: number;
  skippedCount: number;
  missingCount: number;
  failedCount: number;
  downloadedByteCount: number;
}

const refreshKey = ref(0);
const cardsResult = ref<CardsImportResult | null>(null);
const imagesResult = ref<ImagesImportResult | null>(null);
const evolveCardsResult = ref<CardsImportResult | null>(null);
const evolveImagesResult = ref<ImagesImportResult | null>(null);

const cardsImportOperation = computed<TaskOperation>(() => ({
  key:    'cards_import',
  label:  '执行导入',
  icon:   'i-lucide-play',
  create: async () => orpc.shadowverse.createCardsImport({}) as Promise<TaskPageSnapshot>,
}));

const imagesImportOperation = computed<TaskOperation>(() => ({
  key:    'images_import',
  label:  '执行下载',
  icon:   'i-lucide-play',
  create: async () => orpc.shadowverse.createImagesImport({}) as Promise<TaskPageSnapshot>,
}));

const evolveCardsImportOperation = computed<TaskOperation>(() => ({
  key:    'evolve_cards_import',
  label:  '执行导入',
  icon:   'i-lucide-play',
  create: async () => orpc.shadowverse.createEvolveCardsImport({}) as Promise<TaskPageSnapshot>,
}));

const evolveImagesImportOperation = computed<TaskOperation>(() => ({
  key:    'evolve_images_import',
  label:  '执行下载',
  icon:   'i-lucide-play',
  create: async () => orpc.shadowverse.createEvolveImagesImport({}) as Promise<TaskPageSnapshot>,
}));

function onCardsCompleted(snapshot: TaskPageSnapshot) {
  cardsResult.value = (snapshot.result ?? null) as CardsImportResult | null;
}

function onImagesCompleted(snapshot: TaskPageSnapshot) {
  imagesResult.value = (snapshot.result ?? null) as ImagesImportResult | null;
}

function onEvolveCardsCompleted(snapshot: TaskPageSnapshot) {
  evolveCardsResult.value = (snapshot.result ?? null) as CardsImportResult | null;
}

function onEvolveImagesCompleted(snapshot: TaskPageSnapshot) {
  evolveImagesResult.value = (snapshot.result ?? null) as ImagesImportResult | null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
</script>
