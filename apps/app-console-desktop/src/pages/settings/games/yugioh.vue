<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            游戏王设置
          </h1>
          <p class="mt-2 text-sm text-muted">
            从固定结构化来源构建本地卡牌数据，并手动发布到测试目标。
          </p>
        </div>

        <DesktopConfigHeaderActions />
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <div class="space-y-6">
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="font-medium">卡牌数据导入</div>
                  <div class="mt-1 text-xs text-muted">仅使用百鸽提供的 cards.zip 结构化数据。</div>
                </div>
                <UButton
                  icon="i-lucide-download"
                  :loading="importing"
                  :disabled="publishing || imageImporting || job?.status === 'running'"
                  @click="runImport"
                >
                  下载并导入
                </UButton>
              </div>
            </template>

            <div class="space-y-5">
              <div class="rounded-lg border border-default bg-elevated/40 p-4">
                <div class="text-xs text-muted">固定来源</div>
                <div class="mt-1 break-all font-mono text-sm">{{ sourceInfo?.url ?? 'https://ygocdb.com/api/v0/cards.zip' }}</div>
              </div>

              <UAlert
                v-if="importError"
                color="error"
                icon="i-lucide-circle-alert"
                title="导入失败"
                :description="importError"
              />

              <div v-if="job?.kind === 'import'" class="rounded-lg border border-default p-4 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <span>{{ job.message }}</span>
                  <UBadge :label="job.status" color="neutral" variant="soft" />
                </div>
                <div v-if="job.totalCount != null" class="mt-2 text-xs text-muted">
                  {{ job.completedCount ?? 0 }} / {{ job.totalCount }}
                </div>
              </div>

              <div v-if="latestImport" class="space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-sm font-medium">最近导入</div>
                    <div class="mt-1 text-xs text-muted">{{ formatDate(latestImport.completedAt ?? latestImport.startedAt) }}</div>
                  </div>
                  <UBadge :label="latestImport.status" color="neutral" variant="soft" />
                </div>

                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div v-for="item in importStats" :key="item.label" class="rounded-lg border border-default p-3">
                    <div class="text-xs text-muted">{{ item.label }}</div>
                    <div class="mt-1 text-xl font-semibold">{{ item.value }}</div>
                  </div>
                </div>

                <div class="break-all text-xs text-muted">
                  SHA-256：{{ latestImport.archiveHash ?? '—' }}
                </div>
              </div>

              <div v-else class="text-sm text-muted">
                尚未执行导入。
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="font-medium">主卡图导入</div>
                  <div class="mt-1 text-xs text-muted">使用 YGOPRO WebP 卡图；完整导入预计下载约 1.90 GiB。</div>
                </div>
                <UButton
                  icon="i-lucide-images"
                  :loading="imageImporting"
                  :disabled="!hasImageBucket || importing || publishing || job?.status === 'running'"
                  @click="runImageImport"
                >
                  下载并导入卡图
                </UButton>
              </div>
            </template>

            <div class="space-y-5">
              <div class="rounded-lg border border-default bg-elevated/40 p-4">
                <div class="text-xs text-muted">固定清单来源</div>
                <div class="mt-1 break-all font-mono text-sm">{{ imageSourceInfo?.metadataUrl ?? 'https://cdn.233.momobako.com/ygoimg/ygopro/metadata' }}</div>
              </div>

              <UFormField label="本地卡图目录" description="下载的卡图将保存在该目录。">
                <div class="flex flex-col gap-2 sm:flex-row">
                  <UInput v-model="imageBucketInput" class="min-w-0 flex-1" placeholder="选择本地资源目录" />
                  <UButton variant="outline" :disabled="savingImageBucket" @click="chooseImageBucket">选择目录</UButton>
                  <UButton :loading="savingImageBucket" @click="saveImageBucket">保存</UButton>
                  <UButton color="neutral" variant="ghost" :disabled="savingImageBucket" @click="clearImageBucket">清除</UButton>
                </div>
              </UFormField>

              <UAlert
                v-if="imageError"
                color="error"
                icon="i-lucide-circle-alert"
                title="卡图操作失败"
                :description="imageError"
              />

              <UAlert
                v-else-if="imageMessage"
                color="success"
                icon="i-lucide-circle-check"
                title="卡图设置已更新"
                :description="imageMessage"
              />

              <div v-if="job?.kind === 'image_import'" class="rounded-lg border border-default p-4 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <span>{{ job.message }}</span>
                  <UBadge :label="job.status" color="neutral" variant="soft" />
                </div>
                <div v-if="job.totalCount != null" class="mt-2 text-xs text-muted">
                  {{ job.completedCount ?? 0 }} / {{ job.totalCount }}
                </div>
              </div>

              <div v-if="latestImageImport" class="space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-sm font-medium">最近卡图导入</div>
                    <div class="mt-1 text-xs text-muted">{{ formatDate(latestImageImport.completedAt ?? latestImageImport.startedAt) }}</div>
                  </div>
                  <UBadge :label="latestImageImport.status" color="neutral" variant="soft" />
                </div>

                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  <div v-for="item in imageImportStats" :key="item.label" class="rounded-lg border border-default p-3">
                    <div class="text-xs text-muted">{{ item.label }}</div>
                    <div class="mt-1 text-xl font-semibold">{{ item.value }}</div>
                  </div>
                </div>

                <div class="text-xs text-muted">
                  本次下载：{{ formatBytes(latestImageImport.downloadedByteCount) }}
                </div>
              </div>

              <div v-else class="text-sm text-muted">
                尚未执行卡图导入。
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div>
                <div class="font-medium">测试发布目标</div>
                <div class="mt-1 text-xs text-muted">连接信息保存在桌面端安全存储中，发布只能使用 test 环境。</div>
              </div>
            </template>

            <div class="space-y-5">
              <div class="grid gap-4 md:grid-cols-2">
                <UFormField label="目标标识" required>
                  <UInput v-model="targetIdInput" class="w-full" placeholder="yugioh-test" />
                </UFormField>

                <UFormField label="环境">
                  <UInput model-value="test" class="w-full" disabled />
                </UFormField>
              </div>

              <UFormField label="目标连接信息" required>
                <UInput
                  v-model="connectionStringInput"
                  class="w-full"
                  type="password"
                  autocomplete="off"
                  placeholder="请输入目标连接信息"
                />
              </UFormField>

              <div v-if="targetFingerprint" class="break-all rounded-lg border border-default p-3 text-xs text-muted">
                已绑定指纹：{{ targetFingerprint }}
              </div>

              <UAlert
                v-if="targetError"
                color="error"
                icon="i-lucide-circle-alert"
                title="目标操作失败"
                :description="targetError"
              />

              <UAlert
                v-else-if="targetMessage"
                color="success"
                icon="i-lucide-circle-check"
                title="目标连接正常"
                :description="targetMessage"
              />

              <div class="flex flex-wrap gap-2">
                <UButton variant="outline" :loading="testingTarget" @click="testTarget">
                  测试连接
                </UButton>
                <UButton :loading="savingTarget" @click="saveTarget">
                  保存目标
                </UButton>
                <UButton color="neutral" variant="ghost" :disabled="savingTarget" @click="clearTarget">
                  清除
                </UButton>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div class="font-medium">发布卡牌数据</div>
                  <div class="mt-1 text-xs text-muted">发布完成后自动核对数据一致性。</div>
                </div>
                <UButton
                  icon="i-lucide-upload"
                  :loading="publishing"
                  :disabled="!hasSavedTarget || importing || imageImporting || job?.status === 'running'"
                  @click="runPublish"
                >
                  发布到测试目标
                </UButton>
              </div>
            </template>

            <div class="space-y-4">
              <UAlert
                v-if="publishError"
                color="error"
                icon="i-lucide-circle-alert"
                title="发布失败"
                :description="publishError"
              />

              <div v-if="latestPublish" class="space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div class="text-sm font-medium">最近发布</div>
                    <div class="mt-1 text-xs text-muted">{{ formatDate(latestPublish.completedAt ?? latestPublish.createdAt) }}</div>
                  </div>
                  <UBadge :label="latestPublish.status" color="neutral" variant="soft" />
                </div>

                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div v-for="item in publishStats" :key="item.label" class="rounded-lg border border-default p-3">
                    <div class="text-xs text-muted">{{ item.label }}</div>
                    <div class="mt-1 text-xl font-semibold">{{ item.value }}</div>
                  </div>
                </div>

                <div class="break-all text-xs text-muted">
                  Manifest：{{ latestPublish.manifestHash }}
                </div>
              </div>

              <div v-else class="text-sm text-muted">
                尚未向当前测试目标发布。
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  getDesktopYugiohImageSettings,
  getDesktopYugiohPublishTarget,
  pickDesktopDirectory,
  setDesktopYugiohImageSettings,
  setDesktopYugiohPublishTarget,
  testDesktopYugiohPublishTarget,
} from '~/composables/useDesktopSettings';
import {
  getYugiohImportState,
  getYugiohImageImportState,
  getYugiohImageSourceInfo,
  getYugiohJob,
  getYugiohPublishState,
  getYugiohSourceInfo,
  importYugiohCards,
  importYugiohImages,
  publishYugiohCards,
} from '~/composables/useYugiohCards';

import type { YugiohImportReport } from 'service-desktop-runtime/lib/yugioh/cards-import';
import type { YugiohJobSnapshot } from 'service-desktop-runtime/lib/yugioh/cards-progress';
import type { YugiohImageImportReport } from 'service-desktop-runtime/lib/yugioh/image-import';
import type { YugiohPublishReport } from 'service-desktop-runtime/lib/yugioh/cards-publish';
import type { YugiohImageSourceInfo, YugiohSourceInfo } from '~/composables/useYugiohCards';

definePageMeta({
  layout: 'admin',
  title:  '游戏王设置',
});

const toast = useToast();
const sourceInfo = ref<YugiohSourceInfo | null>(null);
const imageSourceInfo = ref<YugiohImageSourceInfo | null>(null);
const latestImport = ref<YugiohImportReport | null>(null);
const latestImageImport = ref<YugiohImageImportReport | null>(null);
const latestPublish = ref<YugiohPublishReport | null>(null);
const job = ref<YugiohJobSnapshot | null>(null);
const importing = ref(false);
const imageImporting = ref(false);
const publishing = ref(false);
const savingImageBucket = ref(false);
const testingTarget = ref(false);
const savingTarget = ref(false);
const importError = ref('');
const imageError = ref('');
const imageMessage = ref('');
const publishError = ref('');
const targetError = ref('');
const targetMessage = ref('');
const targetIdInput = ref('');
const imageBucketInput = ref('');
const savedImageBucket = ref<string | null>(null);
const connectionStringInput = ref('');
const savedTargetId = ref<string | null>(null);
const targetFingerprint = ref<string | null>(null);
let jobPoll: ReturnType<typeof setInterval> | null = null;

const hasSavedTarget = computed(() => savedTargetId.value != null && targetFingerprint.value != null);
const hasImageBucket = computed(() => savedImageBucket.value != null);

const importStats = computed(() => [
  { label: '新增', value: latestImport.value?.addedCount ?? 0 },
  { label: '更新', value: latestImport.value?.updatedCount ?? 0 },
  { label: '跳过', value: latestImport.value?.skippedCount ?? 0 },
  { label: '失败', value: latestImport.value?.failedCount ?? 0 },
  { label: '软删除', value: latestImport.value?.softDeletedCount ?? 0 },
]);

const publishStats = computed(() => [
  { label: '总数', value: latestPublish.value?.totalRowCount ?? 0 },
  { label: '新增', value: latestPublish.value?.insertedRowCount ?? 0 },
  { label: '更新', value: latestPublish.value?.updatedRowCount ?? 0 },
  { label: '未变化', value: latestPublish.value?.unchangedRowCount ?? 0 },
]);

const imageImportStats = computed(() => [
  { label: '新增', value: latestImageImport.value?.addedCount ?? 0 },
  { label: '更新', value: latestImageImport.value?.updatedCount ?? 0 },
  { label: '跳过', value: latestImageImport.value?.skippedCount ?? 0 },
  { label: '失败', value: latestImageImport.value?.failedCount ?? 0 },
  { label: '无可用图', value: latestImageImport.value?.missingCount ?? 0 },
  { label: '软删除', value: latestImageImport.value?.softDeletedCount ?? 0 },
]);

/** User-facing error message normalized from one unknown rejection. */
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Optional form text normalized into a non-empty trimmed value or null. */
function trimToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** ISO timestamp formatted for the current desktop locale. */
function formatDate(value: string | null) {
  return value == null ? '—' : new Date(value).toLocaleString();
}

/** Byte count formatted into one compact binary unit for desktop display. */
function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

/** Current long-running task polled while an explicit desktop action is pending. */
function startJobPolling() {
  stopJobPolling();
  jobPoll = setInterval(() => {
    void getYugiohJob().then((value) => {
      job.value = value;
    }).catch(() => undefined);
  }, 750);
}

/** Active task poller stopped after completion or page disposal. */
function stopJobPolling() {
  if (jobPoll != null) {
    clearInterval(jobPoll);
    jobPoll = null;
  }
}

/** Recent local import state refreshed after page load or import completion. */
async function loadImportState() {
  const state = await getYugiohImportState();
  latestImport.value = state.latest;
}

/** Recent primary-image state refreshed after page load or image import completion. */
async function loadImageImportState() {
  const state = await getYugiohImageImportState();
  latestImageImport.value = state.latest;
}

/** Stored local image bucket loaded without starting any download. */
async function loadImageBucket() {
  const settings = await getDesktopYugiohImageSettings();
  imageBucketInput.value = settings.bucketDir ?? '';
  savedImageBucket.value = settings.bucketDir;
}

/** Recent publication state refreshed only when one test target is configured. */
async function loadPublishState() {
  if (!hasSavedTarget.value) {
    latestPublish.value = null;
    return;
  }

  const state = await getYugiohPublishState();
  latestPublish.value = state.batches[0] ?? null;
}

/** Stored target settings loaded without writing any runtime state. */
async function loadTarget() {
  const settings = await getDesktopYugiohPublishTarget();

  targetIdInput.value = settings.publishTargetId ?? '';
  connectionStringInput.value = settings.connectionString ?? '';
  savedTargetId.value = settings.publishTargetId;
  targetFingerprint.value = settings.targetFingerprint;
}

/** Fixed source downloaded and imported after one explicit button action. */
async function runImport() {
  importing.value = true;
  importError.value = '';
  startJobPolling();

  try {
    latestImport.value = await importYugiohCards();
    job.value = await getYugiohJob();
    toast.add({ title: '导入完成', description: `新增 ${latestImport.value.addedCount}，更新 ${latestImport.value.updatedCount}，跳过 ${latestImport.value.skippedCount}，失败 ${latestImport.value.failedCount}` });
  } catch (error) {
    importError.value = errorMessage(error);
    job.value = await getYugiohJob().catch(() => null);
  } finally {
    stopJobPolling();
    importing.value = false;
  }
}

/** Native directory picker updates the form without persisting it. */
async function chooseImageBucket() {
  imageError.value = '';
  const directory = await pickDesktopDirectory(trimToNull(imageBucketInput.value)).catch((error) => {
    imageError.value = errorMessage(error);
    return null;
  });

  if (directory != null) {
    imageBucketInput.value = directory;
  }
}

/** Local image bucket persisted after one explicit desktop action. */
async function saveImageBucket() {
  savingImageBucket.value = true;
  imageError.value = '';
  imageMessage.value = '';

  try {
    const settings = await setDesktopYugiohImageSettings(trimToNull(imageBucketInput.value));
    imageBucketInput.value = settings.bucketDir ?? '';
    savedImageBucket.value = settings.bucketDir;
    imageMessage.value = settings.bucketDir == null ? '本地卡图目录已清除。' : '本地卡图目录已保存。';
  } catch (error) {
    imageError.value = errorMessage(error);
  } finally {
    savingImageBucket.value = false;
  }
}

/** Stored local image bucket removed without deleting downloaded files. */
async function clearImageBucket() {
  imageBucketInput.value = '';
  await saveImageBucket();
}

/** Fixed primary images downloaded after one explicit button action. */
async function runImageImport() {
  imageImporting.value = true;
  imageError.value = '';
  imageMessage.value = '';
  startJobPolling();

  try {
    latestImageImport.value = await importYugiohImages();
    job.value = await getYugiohJob();
    toast.add({ title: '卡图导入完成', description: `新增 ${latestImageImport.value.addedCount}，更新 ${latestImageImport.value.updatedCount}，跳过 ${latestImageImport.value.skippedCount}，失败 ${latestImageImport.value.failedCount}` });
  } catch (error) {
    imageError.value = errorMessage(error);
    job.value = await getYugiohJob().catch(() => null);
  } finally {
    stopJobPolling();
    imageImporting.value = false;
  }
}

/** Candidate test target checked without changing stored settings. */
async function testTarget() {
  testingTarget.value = true;
  targetError.value = '';
  targetMessage.value = '';

  try {
    const result = await testDesktopYugiohPublishTarget(
      trimToNull(targetIdInput.value),
      'test',
      trimToNull(connectionStringInput.value),
    );
    targetMessage.value = `连接成功：${result.databaseName} / ${result.userName} / ${result.latencyMs}ms`;
  } catch (error) {
    targetError.value = errorMessage(error);
  } finally {
    testingTarget.value = false;
  }
}

/** Verified test target persisted into desktop config and secure storage. */
async function saveTarget() {
  savingTarget.value = true;
  targetError.value = '';
  targetMessage.value = '';

  try {
    const settings = await setDesktopYugiohPublishTarget(
      trimToNull(targetIdInput.value),
      'test',
      trimToNull(connectionStringInput.value),
    );

    savedTargetId.value = settings.publishTargetId;
    targetFingerprint.value = settings.targetFingerprint;
    targetMessage.value = '测试发布目标已保存并绑定。';
    await loadPublishState();
  } catch (error) {
    targetError.value = errorMessage(error);
  } finally {
    savingTarget.value = false;
  }
}

/** Stored test target and its secure connection string removed explicitly. */
async function clearTarget() {
  savingTarget.value = true;
  targetError.value = '';
  targetMessage.value = '';

  try {
    await setDesktopYugiohPublishTarget(null, null, null);
    targetIdInput.value = '';
    connectionStringInput.value = '';
    savedTargetId.value = null;
    targetFingerprint.value = null;
    latestPublish.value = null;
  } catch (error) {
    targetError.value = errorMessage(error);
  } finally {
    savingTarget.value = false;
  }
}

/** Local domain cards published after one explicit button action. */
async function runPublish() {
  publishing.value = true;
  publishError.value = '';
  startJobPolling();

  try {
    latestPublish.value = await publishYugiohCards();
    job.value = await getYugiohJob();
    toast.add({ title: '发布完成', description: `变更 ${latestPublish.value.changedRowCount}，总数 ${latestPublish.value.totalRowCount}` });
  } catch (error) {
    publishError.value = errorMessage(error);
    job.value = await getYugiohJob().catch(() => null);
  } finally {
    stopJobPolling();
    publishing.value = false;
  }
}

onMounted(async () => {
  sourceInfo.value = await getYugiohSourceInfo().catch(() => null);
  imageSourceInfo.value = await getYugiohImageSourceInfo().catch(() => null);
  job.value = await getYugiohJob().catch(() => null);

  try {
    await loadTarget();
  } catch (error) {
    targetError.value = errorMessage(error);
  }

  try {
    await loadImportState();
  } catch (error) {
    importError.value = errorMessage(error);
  }

  try {
    await loadImageBucket();
  } catch (error) {
    imageError.value = errorMessage(error);
  }

  try {
    await loadImageImportState();
  } catch (error) {
    imageError.value = errorMessage(error);
  }

  try {
    await loadPublishState();
  } catch (error) {
    publishError.value = errorMessage(error);
  }
});

onUnmounted(stopJobPolling);
</script>
