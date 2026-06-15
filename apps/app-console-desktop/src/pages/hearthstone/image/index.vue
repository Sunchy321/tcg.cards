<template>
  <div class="desktop-page">
    <div class="space-y-4">
      <UCard>
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-image" class="size-5 text-primary" />
              <h1 class="text-xl font-semibold">图片管理</h1>
            </div>
            <p class="mt-1 text-sm text-muted">
              选择卡图筛选条件，并使用本地渲染端与本地 bucket 目录完成桌面端图片工作流。
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UBadge label="WebP 固定为 q86-m4-fast" color="primary" variant="soft" />
            <UBadge label="本地 bucket 写入" color="neutral" variant="soft" />
            <UBadge label="R2 同步独立执行" color="neutral" variant="soft" />
            <UButton
              label="刷新表单"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="ghost"
              @click="resetForm"
            />
          </div>
        </div>
      </UCard>

      <UAlert
        v-if="configError.length > 0"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :description="configError"
      />

      <UAlert
        v-else-if="!hasImageConfig"
        color="warning"
        variant="soft"
        icon="i-lucide-image-off"
        :ui="{ icon: 'sm:self-center' }"
      >
        <template #description>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>图片配置未完成：缺少 {{ missingConfigText }}。请先在设置页补齐。</span>
            <div class="sm:ml-auto">
              <UButton
                label="打开设置"
                icon="i-lucide-settings"
                color="warning"
                variant="soft"
                to="/settings/games/hearthstone"
              />
            </div>
          </div>
        </template>
      </UAlert>

      <div class="grid gap-4 xl:grid-cols-3">
        <div class="space-y-4 xl:col-span-2">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-1.5">
                  <span class="font-medium">导入规模与筛选条件</span>
                  <UTooltip text="普通/金卡仅 hand.normal；钻石/异画需卡牌具备对应 mechanic；战棋仅 hand.battlegrounds.normal；对战区 play 暂不导出。">
                    <UIcon name="i-lucide-info" class="size-3.5 cursor-help text-muted" />
                  </UTooltip>
                </div>
                <div
                  v-if="lastCounts != null"
                  class="flex items-center gap-3 text-sm text-muted"
                >
                  <span>总数 <span class="font-mono font-semibold text-default">{{ lastCounts.total }}</span></span>
                  <span>已有 <span class="font-mono font-semibold text-success">{{ lastCounts.ready }}</span></span>
                  <span>缺失 <span class="font-mono font-semibold text-warning">{{ lastCounts.missing }}</span></span>
                </div>
              </div>
            </template>

            <div class="space-y-4">
              <UFormField label="导入规模" orientation="horizontal" :ui="{ root: '!justify-start' }">
                <UFieldGroup>
                  <UButton
                    v-for="item in scaleItems"
                    :key="item.value"
                    :label="item.label"
                    :color="scale === item.value ? 'primary' : 'neutral'"
                    :variant="scale === item.value ? 'solid' : 'outline'"
                    size="sm"
                    @click="onScaleChange(item.value)"
                  />
                </UFieldGroup>
              </UFormField>

              <!-- Row 1: lang | version | single-card value -->
              <div class="grid gap-4 md:grid-cols-3">
                <UFormField label="语言" orientation="horizontal" :ui="{ root: '!justify-start' }">
                  <USelect v-model="form.lang" :items="langItems" class="w-40" />
                </UFormField>
                <UFormField label="版本" orientation="horizontal" :ui="{ root: '!justify-start' }">
                  <USelect v-model="form.version" :items="versionItems" class="w-40" />
                </UFormField>
                <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }">
                  <template #label>
                    <span
                      class="cursor-pointer select-none"
                      @click="singleCardMode = singleCardMode === 'cardId' ? 'renderHash' : 'cardId'"
                    >{{ singleCardMode === 'cardId' ? 'Card ID' : 'Render Hash' }}</span>
                  </template>
                  <UInput
                    v-model="singleCardInput"
                    :placeholder="singleCardMode === 'cardId' ? '输入 cardId...' : '输入 renderHash...'"
                    :disabled="scale !== 'single'"
                    class="flex-1"
                  />
                </UFormField>
              </div>

              <!-- Row 2: zones | templates | premiums -->
              <div class="grid gap-4 md:grid-cols-3">
                <UFormField label="展示区域" orientation="horizontal" :ui="{ root: '!justify-start' }">
                  <UFieldGroup>
                    <UButton
                      v-for="item in zoneItems"
                      :key="item.value"
                      :label="item.label"
                      :color="item.disabled ? 'neutral' : form.zones.includes(item.value) ? 'primary' : 'neutral'"
                      :variant="form.zones.includes(item.value) ? 'solid' : 'outline'"
                      size="sm"
                      :disabled="item.disabled === true"
                      @click="toggleValue(form.zones, item.value)"
                    />
                  </UFieldGroup>
                </UFormField>
                <UFormField label="渲染模板" orientation="horizontal" :ui="{ root: '!justify-start' }">
                  <UFieldGroup>
                    <UButton
                      v-for="item in templateItems"
                      :key="item.value"
                      :label="item.label"
                      :color="form.templates.includes(item.value) ? 'primary' : 'neutral'"
                      :variant="form.templates.includes(item.value) ? 'solid' : 'outline'"
                      size="sm"
                      @click="toggleValue(form.templates, item.value)"
                    />
                  </UFieldGroup>
                </UFormField>
                <UFormField label="外观品质" orientation="horizontal" :ui="{ root: '!justify-start' }">
                  <UFieldGroup>
                    <UButton
                      v-for="item in premiumItems"
                      :key="item.value"
                      :label="item.label"
                      :color="form.premiums.includes(item.value) ? 'primary' : 'neutral'"
                      :variant="form.premiums.includes(item.value) ? 'solid' : 'outline'"
                      size="sm"
                      @click="toggleValue(form.premiums, item.value)"
                    />
                  </UFieldGroup>
                </UFormField>
              </div>

              <!-- Row 3: limit -->
              <div class="grid gap-4 md:grid-cols-3">
                <div />
                <div />
                <UFormField label="单次导出数量" orientation="horizontal" :ui="{ root: '!justify-start' }">
                  <UInput
                    v-model="form.limit"
                    type="number"
                    inputmode="numeric"
                    placeholder="默认500，最大2000"
                    :disabled="scale === 'full'"
                    class="w-40"
                  />
                </UFormField>
              </div>

            <UAlert
              v-if="jobError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="jobError"
              />

              <!-- Progress bar -->
              <div
                v-if="currentJob && !isJobTerminal"
                class="space-y-3 rounded-lg border border-default p-4"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="font-medium text-sm">{{ phaseLabel }}</div>
                    <UBadge :label="phaseBadgeColor" variant="soft" size="sm" />
                    <UBadge
                      v-if="isScanAll && currentJob.currentBatchIndex != null && currentJob.totalBatches != null"
                      :label="`批次 ${currentJob.currentBatchIndex}/${currentJob.totalBatches}`"
                      variant="soft"
                      size="sm"
                    />
                  </div>
                  <div class="text-xs text-muted">{{ progressCountText }}</div>
                </div>

                <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all duration-300"
                    :style="{ width: `${jobProgressPercent}%` }"
                  />
                </div>

                <div
                  v-if="isScanAll && currentJob.overallTotalCount != null"
                  class="space-y-1"
                >
                  <div class="flex items-center justify-between text-xs text-muted">
                    <span>全量进度</span>
                    <span>{{ overallProgressCountText }}</span>
                  </div>
                  <div class="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      class="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      :style="{ width: `${overallProgressPercent}%` }"
                    />
                  </div>
                </div>

                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{{ elapsedText }}</span>
                  <span v-if="jobEtaText.length > 0">{{ jobEtaText }}</span>
                  <span v-if="currentJob.completedCount != null && currentJob.rejectedCount">
                    rejected: {{ currentJob.rejectedCount }}
                  </span>
                  <span v-if="isScanAll && currentJob.overallRejectedCount != null && currentJob.overallRejectedCount > 0">
                    全量 rejected: {{ currentJob.overallRejectedCount }}
                  </span>
                </div>

                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-if="isJobRunning"
                    label="暂停"
                    icon="i-lucide-pause"
                    color="warning"
                    variant="soft"
                    size="sm"
                    :loading="pausingJob"
                    :disabled="pausingJob || stoppingJob"
                    @click="pauseJob"
                  />
                  <UButton
                    v-if="isJobPaused"
                    label="继续"
                    icon="i-lucide-play"
                    color="success"
                    variant="soft"
                    size="sm"
                    :loading="resumingJob"
                    :disabled="resumingJob || stoppingJob"
                    @click="resumeJob"
                  />
                  <UButton
                    v-if="!isJobTerminal"
                    label="停止"
                    icon="i-lucide-square"
                    color="error"
                    variant="soft"
                    size="sm"
                    :loading="stoppingJob"
                    :disabled="pausingJob || stoppingJob || resumingJob"
                    @click="stopJob"
                  />
                </div>
              </div>

              <!-- Job alerts -->
              <UAlert
                v-if="currentJob && currentJob.phase === 'completed' && currentJob.outputMode !== 'download'"
                color="success"
                variant="soft"
                icon="i-lucide-badge-check"
              >
                <template #description>
                  <div>
                    任务完成
                    <span v-if="currentJob.writtenCount != null">，写入 {{ currentJob.writtenCount }} 个文件</span>
                    <span v-if="currentJob.skippedCount">，跳过 {{ currentJob.skippedCount }} 个</span>
                    <span v-if="isScanAll && currentJob.currentBatchIndex != null">
                      ，共 {{ currentJob.currentBatchIndex }} 批次
                    </span>
                  </div>
                </template>
              </UAlert>

              <UAlert
                v-if="currentJob && currentJob.phase === 'completed' && currentJob.outputMode === 'download'"
                color="success"
                variant="soft"
                icon="i-lucide-package-check"
              >
                <template #description>
                  <span>打包完成
                    <span v-if="currentJob.completedCount != null">，{{ currentJob.completedCount }} 个文件，已触发浏览器下载</span>
                  </span>
                </template>
              </UAlert>

              <UAlert
                v-if="currentJob && currentJob.phase === 'failed'"
                color="error"
                variant="soft"
                icon="i-lucide-circle-x"
                :description="currentJob.errorMessage ?? '任务执行失败'"
              />

              <UAlert
                v-if="currentJob && currentJob.phase === 'stopped'"
                color="neutral"
                variant="soft"
                icon="i-lucide-circle-stop"
              >
                <template #description>
                  <div>
                    任务已停止
                    <span v-if="currentJob.writtenCount != null">，写入 {{ currentJob.writtenCount }} 个文件</span>
                    <span v-if="currentJob.rejectedCount">，失败 {{ currentJob.rejectedCount }} 个</span>
                    <span v-if="isScanAll && currentJob.currentBatchIndex != null">
                      ，共 {{ currentJob.currentBatchIndex }} 批次
                    </span>
                  </div>
                </template>
              </UAlert>

              <!-- Export requests JSON display (single-card non-all only) -->
              <div v-if="debugRequestResult" class="space-y-2">
                <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{{ debugRequestResult.cardId }}</span>
                  <UBadge :label="`set: ${debugRequestResult.set}`" variant="soft" size="xs" />
                  <UBadge :label="`type: ${debugRequestResult.type}`" variant="soft" size="xs" />
                  <UBadge :label="`techLevel: ${debugRequestResult.techLevel ?? '-'}`" variant="soft" size="xs" />
                  <UBadge :label="`${debugRequestResult.variantCount} variant(s)`" variant="soft" size="xs" />
                </div>

                <div
                  v-for="(req, index) in debugRequestResult.requests"
                  :key="req.requestId"
                  class="space-y-1"
                >
                  <div class="flex items-center justify-between">
                    <div class="text-xs font-medium">
                      {{ req.variant.zone }}.{{ req.variant.template }}.{{ req.variant.premium }}
                    </div>
                    <UButton
                      :label="copiedIndex === index ? '已复制' : '复制'"
                      :icon="copiedIndex === index ? 'i-lucide-check' : 'i-lucide-copy'"
                      :color="copiedIndex === index ? 'success' : 'neutral'"
                      variant="ghost"
                      size="xs"
                      @click="copyDebugRequest(index)"
                    />
                  </div>
                  <pre class="max-h-48 overflow-auto rounded-lg border border-default bg-muted p-2 text-xs"><code>{{ formatDebugRequestJson(req) }}</code></pre>
                </div>
              </div>

              <!-- Action buttons -->
              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  v-if="(!currentJob || isJobTerminal) && scale !== 'single'"
                  label="计算总数"
                  icon="i-lucide-hash"
                  color="neutral"
                  variant="soft"
                  :loading="counting"
                  :disabled="!hasImageConfig || counting"
                  @click="countMatchingImages"
                />
                <UButton
                  v-if="!currentJob || isJobTerminal"
                  label="渲染预览"
                  icon="i-lucide-eye"
                  color="primary"
                  variant="soft"
                  :loading="actionLoading === 'preview'"
                  :disabled="!hasImageConfig || actionLoading !== null || scale !== 'single' || singleCardInput.trim().length === 0 || form.version === 'all'"
                  @click="executeAction('preview')"
                />
                <UButton
                  v-if="!currentJob || isJobTerminal"
                  :label="scale === 'batch' ? '导出请求文件' : '生成请求'"
                  icon="i-lucide-code"
                  color="primary"
                  variant="soft"
                  :loading="actionLoading === 'export'"
                  :disabled="!hasImageConfig || actionLoading !== null || scale === 'full' || (scale === 'single' && singleCardInput.trim().length === 0)"
                  @click="executeAction('export')"
                />
                <UButton
                  v-if="!currentJob || isJobTerminal"
                  label="打包下载"
                  icon="i-lucide-download"
                  color="primary"
                  variant="soft"
                  :loading="actionLoading === 'download'"
                  :disabled="!hasImageConfig || actionLoading !== null || scale === 'full' || (scale === 'single' && singleCardInput.trim().length === 0)"
                  @click="executeAction('download')"
                />
                <UButton
                  v-if="!currentJob || isJobTerminal"
                  :label="scale === 'full' ? '全量渲染写入' : scale === 'batch' ? '批量渲染写入' : '渲染写入存储'"
                  icon="i-lucide-play"
                  color="primary"
                  variant="soft"
                  :loading="actionLoading === 'write'"
                  :disabled="!hasImageConfig || actionLoading !== null || (scale === 'single' && singleCardInput.trim().length === 0)"
                  @click="executeAction('write')"
                />
                <UButton
                  v-if="currentJob && isJobTerminal"
                  label="重新开始"
                  icon="i-lucide-rotate-ccw"
                  color="neutral"
                  variant="soft"
                  @click="resetJob"
                />
                <UButton
                  v-if="currentJob && isJobTerminal && rejectedLogDir"
                  label="打开拒收日志文件夹"
                  icon="i-lucide-folder-open"
                  color="neutral"
                  variant="soft"
                  @click="openRejectedLogFolder"
                />
              </div>
            </div>
          </UCard>
        </div>

        <!-- Right column -->
        <div class="space-y-3">
          <!-- Preview card -->
          <UCard v-if="previewResult">
            <template #header>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{{ previewResult.cardId }}</span>
                <div class="flex items-center gap-1.5">
                  <UBadge :label="previewResult.set" variant="soft" size="xs" />
                  <UBadge :label="previewResult.type" variant="soft" size="xs" />
                </div>
              </div>
            </template>

            <div class="space-y-3">
              <div class="flex flex-wrap gap-1">
                <UBadge
                  v-for="(preview, index) in previewResult.previews"
                  :key="preview.requestId"
                  :label="`${preview.zone}.${preview.template}.${preview.premium}`"
                  :color="selectedPreviewIndex === index ? 'primary' : 'neutral'"
                  :variant="selectedPreviewIndex === index ? 'solid' : 'soft'"
                  size="sm"
                  class="cursor-pointer"
                  @click="selectedPreviewIndex = index"
                />
              </div>
              <img
                v-if="previewResult.previews[selectedPreviewIndex]"
                :src="`data:image/png;base64,${previewResult.previews[selectedPreviewIndex]!.base64Png}`"
                :alt="`${previewResult.previews[selectedPreviewIndex]!.zone}.${previewResult.previews[selectedPreviewIndex]!.template}.${previewResult.previews[selectedPreviewIndex]!.premium}`"
                class="w-full rounded-lg border border-default"
              />
            </div>
          </UCard>

          <!-- Settings card -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <div class="text-sm font-medium">本地配置 · 状态</div>
                <UButton
                  label="设置"
                  icon="i-lucide-settings"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  to="/settings/games/hearthstone"
                />
              </div>
            </template>

            <div class="space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-muted shrink-0">Renderer URL</span>
                <span class="ml-2 truncate font-mono text-default">{{ imageSettings.rendererBaseUrl ?? '-' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-muted shrink-0">Bucket Dir</span>
                <span class="ml-2 truncate font-mono text-default">{{ imageSettings.bucketDir ?? '-' }}</span>
              </div>

              <UDivider class="my-1!" />

              <div class="flex items-center justify-between">
                <span class="text-muted">配置状态</span>
                <span :class="hasImageConfig ? 'text-success' : 'text-warning'">
                  {{ hasImageConfig ? '已就绪' : '未完成' }}
                </span>
              </div>

              <div class="flex items-center justify-between">
                <span class="text-muted">渲染端</span>
                <UButton
                  label="检测"
                  icon="i-lucide-plug"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :loading="loadingRendererHealth"
                  @click="loadRendererHealth"
                />
              </div>
              <div
                v-if="rendererHealth"
                class="text-muted"
              >
                <span :class="rendererReady ? 'text-success' : rendererHealth.reachable ? 'text-warning' : 'text-error'">
                  {{ rendererStatusText }}
                </span>
                <template v-if="rendererHealth.status">
                  · {{ rendererHealth.status.service }} {{ rendererHealth.status.version }}
                  · protocol {{ rendererHealth.status.protocolVersion }}
                </template>
              </div>
              <div v-else-if="rendererHealthError.length > 0" class="text-error truncate">
                {{ rendererHealthError }}
              </div>

              <UDivider class="my-1!" />

              <div class="flex items-center justify-between">
                <span class="text-muted">筛选</span>
                <span class="text-default">{{ summaryText }}</span>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ImagePremium, ImageTemplate, ImageZone } from '#model/hearthstone/schema/data/image';
import type { Locale } from '#model/hearthstone/schema/basic';

import { useToast } from '@nuxt/ui/composables';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { listLocalHsdataSourceVersions, type HsdataSourceVersionStatus } from '~/composables/useHsdataRepo';
import { getDesktopHearthstoneImageSettings } from '~/composables/useDesktopSettings';
import {
  debugDesktopHearthstoneImageRenderRequest,
  detectDesktopHearthstoneImageRenderer,
  downloadDesktopHearthstoneImageArchive,
  exportDesktopHearthstoneImageRequirements,
  getCurrentDesktopHearthstoneImageJob,
  getDesktopHearthstoneImageArchive,
  openDesktopPath,
  triggerDownload,
  triggerJsonDownload,
  pauseDesktopHearthstoneImageJob,
  previewDesktopHearthstoneImage,
  resumeDesktopHearthstoneImageJob,
  stopDesktopHearthstoneImageJob,
  submitDesktopHearthstoneImageJob,
  submitDesktopHearthstoneReimportByRenderHash,
  watchDesktopImageJobProgress,
  type DesktopDebugRenderRequestResult,
  type DesktopDownloadArchiveSyncResult,
  type DesktopHearthstoneImageJob,
  type DesktopImageJobProgressEvent,
  type DesktopPreviewRenderResult,
  type DesktopRendererHealthResult,
} from '~/composables/useDesktopRuntimeClient';

definePageMeta({
  layout: 'admin',
  title:  '卡牌图片导入',
});

const toast = useToast();

// ── Scale ──

type ImageScale = 'single' | 'batch' | 'full';
type ImageOutputType = 'preview' | 'download' | 'write' | 'export';
type SingleCardMode = 'cardId' | 'renderHash';

const scale = ref<ImageScale>('single');
const singleCardMode = ref<SingleCardMode>('cardId');
const singleCardInput = ref('');

const scaleItems: Array<{ label: string; value: ImageScale }> = [
  { label: '单卡导入', value: 'single' },
  { label: '批量导入', value: 'batch' },
  { label: '全量导入', value: 'full' },
];

const singleCardModeItems: Array<{ label: string; value: SingleCardMode }> = [
  { label: 'cardId', value: 'cardId' },
  { label: 'renderHash', value: 'renderHash' },
];

function onScaleChange(value: ImageScale) {
  scale.value = value;
  persistImagePageState();
}

// ── Form state ──

const langItems: Array<{ label: string, value: Locale }> = [
  { label: '简体中文', value: 'zhs' },
  { label: 'English', value: 'en' },
  { label: '繁體中文', value: 'zht' },
  { label: '日本語', value: 'ja' },
  { label: '한국어', value: 'ko' },
  { label: 'Deutsch', value: 'de' },
  { label: 'Français', value: 'fr' },
  { label: 'Español', value: 'es' },
  { label: 'Italiano', value: 'it' },
  { label: 'Português', value: 'pt' },
  { label: 'Русский', value: 'ru' },
  { label: 'ไทย', value: 'th' },
  { label: 'Español (MX)', value: 'mx' },
  { label: 'Polski', value: 'pl' },
];

const zoneItems: Array<{ disabled?: boolean, label: string, value: ImageZone }> = [
  { label: '手牌', value: 'hand' },
  { label: '对战', value: 'play', disabled: true },
];

const templateItems: Array<{ label: string, value: ImageTemplate }> = [
  { label: '普通', value: 'normal' },
  { label: '战棋', value: 'battlegrounds' },
];

const premiumItems: Array<{ label: string, value: ImagePremium }> = [
  { label: '普通', value: 'normal' },
  { label: '金卡', value: 'golden' },
  { label: '钻石', value: 'diamond' },
  { label: '异画', value: 'signature' },
];

const form = reactive({
  lang:      'zhs' as Locale,
  version:   'latest',
  zones:     ['hand'] as ImageZone[],
  templates: ['normal', 'battlegrounds'] as ImageTemplate[],
  premiums:  ['normal', 'golden', 'diamond', 'signature'] as ImagePremium[],
  limit:     '500',
});

// ── Result state ──

const previewResult = ref<DesktopPreviewRenderResult | null>(null);
const selectedPreviewIndex = ref(0);
const downloadResult = ref<DesktopDownloadArchiveSyncResult | null>(null);
const debugRequestResult = ref<DesktopDebugRenderRequestResult | null>(null);
const debugRequestError = ref('');

// ── Loading & job state ──

const actionLoading = ref<ImageOutputType | null>(null);
const loadingConfig = ref(false);
const configError = ref('');
const submittingJob = ref(false);
const submittingScanAllJob = ref(false);
const counting = ref(false);
const pausingJob = ref(false);
const stoppingJob = ref(false);
const resumingJob = ref(false);
const jobError = ref('');
const currentJob = ref<DesktopHearthstoneImageJob | null>(null);
const progressClockMs = ref(Date.now());
let progressClockHandle: ReturnType<typeof setInterval> | null = null;
let stopProgressStream: (() => void) | null = null;
const loadingRendererHealth = ref(false);
const rendererHealthError = ref('');
const rendererHealth = ref<DesktopRendererHealthResult | null>(null);
const versionItems = ref<Array<{ label: string, value: string }>>([
  { label: 'latest', value: 'latest' },
]);
const imageSettings = ref<{
  rendererBaseUrl: string | null;
  bucketDir:       string | null;
}>({
  rendererBaseUrl: null,
  bucketDir:       null,
});

// ── Config helpers ──

function normalizeConfigValue(value: string | null | undefined) {
  const nextValue = value?.trim() ?? '';
  return nextValue.length > 0 ? nextValue : null;
}

function normalizeImageSettings(settings: {
  rendererBaseUrl: string | null;
  bucketDir:       string | null;
}) {
  return {
    rendererBaseUrl: normalizeConfigValue(settings.rendererBaseUrl),
    bucketDir:       normalizeConfigValue(settings.bucketDir),
  };
}

const hasImageConfig = computed(() => (
  imageSettings.value.rendererBaseUrl != null
  && imageSettings.value.bucketDir != null
));

const missingConfigText = computed(() => {
  const missing: string[] = [];
  if (imageSettings.value.rendererBaseUrl == null) missing.push('Renderer Base URL');
  if (imageSettings.value.bucketDir == null) missing.push('Bucket Directory');
  return missing.join(' / ');
});

const summaryText = computed(() => {
  if (scale.value === 'single') {
    return `单卡 — ${singleCardMode.value}=${singleCardInput.value || '-'} / lang=${form.lang}`;
  }
  const zones = form.zones.join(', ') || '-';
  const templates = form.templates.join(', ') || '-';
  const premiums = form.premiums.join(', ') || '-';
  const version = form.version.trim().length > 0 ? form.version.trim() : 'latest';
  return `lang=${form.lang} / version=${version} / zone=${zones} / template=${templates} / premium=${premiums}`;
});

const rendererReady = computed(() => (
  rendererHealth.value?.configured === true
  && rendererHealth.value?.reachable === true
  && rendererHealth.value?.status?.ready === true
));

const rendererStatusText = computed(() => {
  if (rendererHealthError.value.length > 0) return '检测失败';
  if (rendererHealth.value == null) return '未检测';
  if (!rendererHealth.value.configured) return '未配置';
  if (!rendererHealth.value.reachable) return '不可达';
  if (!rendererHealth.value.status?.ready) return '未就绪';
  return '就绪';
});

// ── Job derived state ──

const isScanAll = computed(() => currentJob.value?.filters?.scanAll === true);

const isJobTerminal = computed(() => (
  currentJob.value?.phase === 'completed' || currentJob.value?.phase === 'failed' || currentJob.value?.phase === 'stopped'
));

const isJobPaused = computed(() => currentJob.value?.phase === 'paused');

const isJobRunning = computed(() => (
  currentJob.value != null && !isJobTerminal.value && !isJobPaused.value
));

watch(isJobTerminal, (terminal) => {
  if (terminal && currentJob.value?.phase === 'completed') {
    if (currentJob.value?.outputMode === 'download' && currentJob.value.downloadArchivePath) {
      void (async () => {
        try {
          const archive = await getDesktopHearthstoneImageArchive(currentJob.value!.downloadArchivePath!);
          triggerDownload(archive.base64Zip, archive.fileName);
          toast.add({ title: '下载完成', description: archive.fileName, color: 'success' });
        } catch { /* ignore */ }
      })();
    }
    countMatchingImages();
  }
});

const phaseLabels: Record<string, string> = {
  exporting_requirements:    '正在导出图片需求清单...',
  submitting_renderer_job:   '正在渲染卡图...',
  importing_local_bucket:    '正在导入本地 bucket...',
  building_archive:          '正在打包 ZIP 文件...',
  paused:                    '已暂停',
  stopped:                   '已停止',
  completed:                 '任务完成',
  failed:                    '任务失败',
};

const phaseLabel = computed(() => (
  phaseLabels[currentJob.value?.phase ?? ''] ?? (currentJob.value?.phase ?? '')
));

const phaseBadgeColor = computed(() => {
  const phase = currentJob.value?.phase;
  if (phase === 'completed') return 'success';
  if (phase === 'failed') return 'error';
  if (phase === 'paused') return 'warning';
  if (phase === 'stopped') return 'neutral';
  return 'info';
});

const jobProgressPercent = computed(() => {
  const total = currentJob.value?.totalCount;
  const completed = currentJob.value?.completedCount;
  if (total == null || total === 0 || completed == null) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
});

const overallProgressPercent = computed(() => {
  const total = currentJob.value?.overallTotalCount;
  const completed = currentJob.value?.overallCompletedCount;
  if (total == null || total === 0 || completed == null) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
});

const overallProgressCountText = computed(() => {
  const total = currentJob.value?.overallTotalCount;
  const completed = currentJob.value?.overallCompletedCount;
  if (total == null || completed == null) return '';
  return `${completed} / ${total}`;
});

interface ImageCounts {
  total: number;
  ready: number;
  missing: number;
}

const lastCounts = ref<ImageCounts | null>(null);

const progressCountText = computed(() => {
  const total = currentJob.value?.totalCount;
  const completed = currentJob.value?.completedCount;
  if (total == null || completed == null) return '';
  return `${completed} / ${total}`;
});

const elapsedSeconds = computed(() => {
  const started = currentJob.value?.startedAt;
  if (!started) return 0;
  return Math.max(0, Math.floor((progressClockMs.value - new Date(started).getTime()) / 1000));
});

const elapsedText = computed(() => {
  const seconds = elapsedSeconds.value;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `耗时 ${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `耗时 ${minutes}m ${secs}s`;
  return `耗时 ${secs}s`;
});

const jobEtaText = computed(() => {
  if (isJobTerminal.value) return '';
  const pct = jobProgressPercent.value;
  if (pct <= 0) return '';
  const elapsed = elapsedSeconds.value;
  const total = Math.round(elapsed / (pct / 100));
  const remaining = Math.max(0, total - elapsed);
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return `预计剩余 ${minutes}m ${secs}s`;
});

// ── Progress clock ──

function startProgressClock() {
  stopProgressClock();
  progressClockMs.value = Date.now();
  progressClockHandle = setInterval(() => {
    progressClockMs.value = Date.now();
  }, 500);
}

function stopProgressClock() {
  if (progressClockHandle != null) {
    clearInterval(progressClockHandle);
    progressClockHandle = null;
  }
}

// ── buildJobInput ──

function buildJobInput(scanAll = false) {
  const versionRaw = form.version.trim();
  return {
    lang:        form.lang,
    ...(versionRaw.length > 0 && versionRaw !== 'latest' && versionRaw !== 'all' ? { version: Number.parseInt(versionRaw, 10) } : {}),
    ...(versionRaw === 'all' ? { allVersions: true } : {}),
    zones:       form.zones,
    templates:   form.templates,
    premiums:    form.premiums,
    limit:       Math.min(Number.parseInt(form.limit, 10) || 500, 500),
    scanAll,
  };
}

// ── Action dispatcher ──

async function executeAction(outputType: ImageOutputType) {
  actionLoading.value = outputType;
  jobError.value = '';
  previewResult.value = null;
  selectedPreviewIndex.value = 0;
  downloadResult.value = null;
  debugRequestResult.value = null;
  debugRequestError.value = '';

  try {
    if (scale.value === 'single') {
      await executeSingleAction(outputType);
    } else if (scale.value === 'batch') {
      await executeBatchAction(outputType);
    } else {
      await executeFullAction(outputType);
    }
  } catch (error) {
    console.error('Action failed:', error);
    jobError.value = getConsoleErrorMessage(error, '操作失败');
  } finally {
    actionLoading.value = null;
  }
}

async function executeSingleAction(outputType: ImageOutputType) {
  const input = singleCardInput.value.trim();
  if (input.length === 0) return;

  const lang = form.lang;
  const zones = form.zones;
  const templates = form.templates;
  const premiums = form.premiums;

  if (outputType === 'preview') {
    selectedPreviewIndex.value = 0;
    previewResult.value = await previewDesktopHearthstoneImage({
      ...(singleCardMode.value === 'cardId' ? { cardId: input } : { renderHash: input }),
      lang,
      zones,
      templates,
      premiums,
    });
    return;
  }

  if (outputType === 'download') {
    const result = await downloadDesktopHearthstoneImageArchive({
      ...(singleCardMode.value === 'cardId' ? { cardId: input } : { renderHash: input }),
      lang,
      zones,
      templates,
      premiums,
      ...(form.version === 'all' ? { allVersions: true } : {}),
    });
    if ('base64Zip' in result) {
      triggerDownload(result.base64Zip, result.fileName);
      toast.add({ title: '下载完成', description: result.fileName, color: 'success' });
    }
    return;
  }

  if (outputType === 'write') {
    cleanupJobSubscription();

    try {
      const result = await submitDesktopHearthstoneReimportByRenderHash({
        ...(singleCardMode.value === 'cardId' ? { cardId: input } : { renderHash: input }),
        lang,
        zones,
        templates,
        premiums,
        ...(form.version === 'all' ? { allVersions: true } : {}),
      });
      currentJob.value = result.job;

      if (!isJobTerminal.value) {
        startProgressClock();
        stopProgressStream = watchDesktopImageJobProgress(event => {
          applyProgressEvent(currentJob.value, event);
        });
      } else {
        stopProgressClock();
      }
    } catch (error) {
      jobError.value = getConsoleErrorMessage(error, '任务提交失败');
    }
    return;
  }

  if (outputType === 'export') {
    try {
      if (form.version === 'all' && singleCardMode.value === 'cardId') {
        // All versions: export request file (batch-style)
        const result = await exportDesktopHearthstoneImageRequirements({
          lang:        form.lang,
          cardId:      input,
          zones:       form.zones,
          templates:   form.templates,
          premiums:    form.premiums,
          allVersions: true,
          limit:       Math.min(Number.parseInt(form.limit, 10) || 500, 500),
        });
        triggerJsonDownload(JSON.parse(result.content), result.fileName);
        toast.add({ title: '生成完成', description: result.fileName, color: 'success' });
      } else {
        debugRequestResult.value = await debugDesktopHearthstoneImageRenderRequest({
          ...(singleCardMode.value === 'cardId' ? { cardId: input } : { renderHash: input }),
          lang,
          zones,
          templates,
          premiums,
        });
      }
    } catch (error) {
      debugRequestError.value = getConsoleErrorMessage(error, '生成失败');
    }
    return;
  }
}

async function executeBatchAction(outputType: ImageOutputType) {
  if (outputType === 'download') {
    cleanupJobSubscription();

    const versionRaw = form.version.trim();
    const result = await downloadDesktopHearthstoneImageArchive({
      lang:        form.lang,
      zones:       form.zones,
      templates:   form.templates,
      premiums:    form.premiums,
      version:     versionRaw.length > 0 && versionRaw !== 'latest' && versionRaw !== 'all' ? Number.parseInt(versionRaw, 10) : undefined,
      allVersions: versionRaw === 'all' ? true : undefined,
      limit:       Math.min(Number.parseInt(form.limit, 10) || 500, 500),
    });

    if ('job' in result) {
      currentJob.value = result.job;
      if (!isJobTerminal.value) {
        startProgressClock();
        stopProgressStream = watchDesktopImageJobProgress(event => {
          applyProgressEvent(currentJob.value, event);
        });
      }
    } else {
      triggerDownload(result.base64Zip, result.fileName);
      downloadResult.value = result;
    }
    return;
  }

  if (outputType === 'write') {
    await startJob(false);
    return;
  }

  if (outputType === 'export') {
    const result = await exportDesktopHearthstoneImageRequirements(buildJobInput());
    triggerJsonDownload(JSON.parse(result.content), result.fileName);
    toast.add({ title: '生成完成', description: result.fileName, color: 'success' });
    return;
  }
}

async function executeFullAction(outputType: ImageOutputType) {
  if (outputType === 'write') {
    await startScanAllJob();
    return;
  }
}

// ── Job operations ──

async function countMatchingImages() {
  counting.value = true;
  try {
    const input = { ...buildJobInput(), scanAll: true };
    const result = await exportDesktopHearthstoneImageRequirements(input);
    const missing = result.requestCount + result.remainingEstimate;
    lastCounts.value = {
      total: result.totalEstimate,
      ready: result.readyEstimate,
      missing,
    };
  } catch (error) {
    console.error('Failed to count matching images:', error);
  } finally {
    counting.value = false;
  }
}

async function startJob(scanAll = false) {
  if (scanAll) {
    submittingScanAllJob.value = true;
  } else {
    submittingJob.value = true;
  }
  jobError.value = '';
  cleanupJobSubscription();

  try {
    const result = await submitDesktopHearthstoneImageJob(buildJobInput(scanAll));
    currentJob.value = result.job;

    if (!isJobTerminal.value) {
      startProgressClock();
      stopProgressStream = watchDesktopImageJobProgress(event => {
        applyProgressEvent(currentJob.value, event);
      });
    } else {
      stopProgressClock();
    }
  } catch (error) {
    console.error('Failed to submit job:', error);
    jobError.value = getConsoleErrorMessage(error, '任务提交失败');
  } finally {
    submittingJob.value = false;
    submittingScanAllJob.value = false;
  }
}

async function startScanAllJob() {
  await startJob(true);
}

async function pauseJob() {
  pausingJob.value = true;
  try {
    const result = await pauseDesktopHearthstoneImageJob();
    applyProgressEvent(currentJob.value, result.job);
  } catch (error) {
    jobError.value = getConsoleErrorMessage(error, '暂停失败');
  } finally {
    pausingJob.value = false;
  }
}

async function stopJob() {
  stoppingJob.value = true;
  try {
    const result = await stopDesktopHearthstoneImageJob();
    applyProgressEvent(currentJob.value, result.job);
    stopProgressClock();
  } catch (error) {
    jobError.value = getConsoleErrorMessage(error, '停止失败');
  } finally {
    stoppingJob.value = false;
  }
}

async function resumeJob() {
  resumingJob.value = true;
  try {
    cleanupJobSubscription();
    const result = await resumeDesktopHearthstoneImageJob();
    currentJob.value = result.job;
    if (!isJobTerminal.value) {
      startProgressClock();
      stopProgressStream = watchDesktopImageJobProgress(event => {
        applyProgressEvent(currentJob.value, event);
      });
    }
  } catch (error) {
    jobError.value = getConsoleErrorMessage(error, '恢复失败');
  } finally {
    resumingJob.value = false;
  }
}

async function syncCurrentJob() {
  try {
    const job = await getCurrentDesktopHearthstoneImageJob();
    if (job) {
      currentJob.value = job;
      if (!isJobTerminal.value) {
        startProgressClock();
        stopProgressStream = watchDesktopImageJobProgress(event => {
          applyProgressEvent(currentJob.value, event);
        });
      }
    }
  } catch { /* no-op */ }
}

function applyProgressEvent(
  state: DesktopHearthstoneImageJob | null,
  event: DesktopImageJobProgressEvent,
) {
  if (state == null) return;
  state.phase = event.phase;
  state.message = event.message;
  state.phaseStartedAt = event.phaseStartedAt;
  state.finishedAt = event.finishedAt;
  state.completedCount = event.completedCount;
  state.totalCount = event.totalCount;
  state.writtenCount = event.writtenCount;
  state.skippedCount = event.skippedCount;
  state.rejectedCount = event.rejectedCount;
  state.errorMessage = event.errorMessage;
  state.rejectedLogPath = event.rejectedLogPath;
  state.overallTotalCount = event.overallTotalCount;
  state.overallCompletedCount = event.overallCompletedCount;
  state.overallRejectedCount = event.overallRejectedCount;
  state.currentBatchIndex = event.currentBatchIndex;
  state.totalBatches = event.totalBatches;
  state.downloadArchivePath = event.downloadArchivePath;
  currentJob.value = { ...state };
  if (isJobTerminal.value) stopProgressClock();
}

function cleanupJobSubscription() {
  stopProgressClock();
  if (stopProgressStream != null) {
    stopProgressStream();
    stopProgressStream = null;
  }
}

const rejectedLogDir = computed(() => {
  const path = currentJob.value?.rejectedLogPath;
  if (!path) return null;
  const separator = path.includes('\\') ? '\\' : '/';
  return path.slice(0, path.lastIndexOf(separator));
});

async function openRejectedLogFolder() {
  if (!rejectedLogDir.value) return;
  try {
    await openDesktopPath(rejectedLogDir.value);
  } catch (error) {
    console.error('Failed to open rejected log folder:', error);
  }
}

function resetJob() {
  cleanupJobSubscription();
  currentJob.value = null;
  jobError.value = '';
  previewResult.value = null;
  selectedPreviewIndex.value = 0;
  downloadResult.value = null;
  debugRequestResult.value = null;
  debugRequestError.value = '';
}

// ── Settings & health ──

async function loadImageSettings() {
  loadingConfig.value = true;
  configError.value = '';

  try {
    imageSettings.value = normalizeImageSettings(await getDesktopHearthstoneImageSettings());
  } catch (error) {
    console.error('Failed to load desktop Hearthstone image settings:', error);
    configError.value = getConsoleErrorMessage(error, '图片配置读取失败');
  } finally {
    loadingConfig.value = false;
  }
}

async function loadRendererHealth() {
  loadingRendererHealth.value = true;
  rendererHealthError.value = '';

  try {
    rendererHealth.value = await detectDesktopHearthstoneImageRenderer();
  } catch (error) {
    console.error('Failed to check Hearthstone image renderer health:', error);
    rendererHealthError.value = getConsoleErrorMessage(error, '渲染端状态检测失败');
    rendererHealth.value = null;
  } finally {
    loadingRendererHealth.value = false;
  }
}

async function loadVersionItems() {
  try {
    const rows = await listLocalHsdataSourceVersions();
    const builds = rows
      .filter((row: HsdataSourceVersionStatus) => row.importStatus === 'completed' && row.build != null)
      .map(row => row.build!);
    const uniqueBuilds = [...new Set(builds)].sort((a, b) => b - a);

    versionItems.value = [
      { label: 'latest', value: 'latest' },
      { label: 'all', value: 'all' },
      ...uniqueBuilds.map(build => ({
        label: `build ${build}`,
        value: String(build),
      })),
    ];
  } catch (error) {
    console.error('Failed to load desktop Hearthstone version options:', error);
    versionItems.value = [{ label: 'latest', value: 'latest' }];
  }
}

function resetForm() {
  form.lang = 'zhs';
  form.version = 'latest';
  form.zones = ['hand'];
  form.templates = ['normal'];
  form.premiums = ['normal'];
  form.limit = '500';
  scale.value = 'single';
  singleCardMode.value = 'cardId';
  singleCardInput.value = '';
  previewResult.value = null;
  selectedPreviewIndex.value = 0;
  downloadResult.value = null;
  debugRequestResult.value = null;
  debugRequestError.value = '';
}

function toggleValue<T>(list: T[], value: T) {
  const index = list.indexOf(value);
  if (index >= 0) {
    if (list.length > 1) list.splice(index, 1);
    return;
  }
  list.push(value);
}

// ── Debug display helpers ──

const copiedIndex = ref<number | null>(null);

function formatDebugRequestJson(request: unknown) {
  return JSON.stringify(request, null, 2);
}

async function copyDebugRequest(index: number) {
  const request = debugRequestResult.value?.requests[index];
  if (!request) return;
  try {
    await navigator.clipboard.writeText(formatDebugRequestJson(request));
    copiedIndex.value = index;
    setTimeout(() => { copiedIndex.value = null; }, 2000);
  } catch {
    // no-op
  }
}

// ── Local storage persistence ──

const IMAGE_PAGE_STATE_KEY = 'console-desktop-hearthstone-image-page-v3';

interface ImagePageState {
  lang: Locale;
  version: string;
  zones: ImageZone[];
  templates: ImageTemplate[];
  premiums: ImagePremium[];
  limit: string;
  scale: ImageScale;
  singleCardMode: SingleCardMode;
  singleCardInput: string;
}

function createDefaultImagePageState(): ImagePageState {
  return {
    lang:      'zhs',
    version:   'latest',
    zones:     ['hand'],
    templates: ['normal', 'battlegrounds'],
    premiums:  ['normal', 'golden', 'diamond', 'signature'],
    limit:     '500',
    scale:     'single',
    singleCardMode: 'cardId',
    singleCardInput: '',
  };
}

function normalizeImagePageState(value: unknown): ImagePageState {
  const defaults = createDefaultImagePageState();
  if (typeof value !== 'object' || value == null) return defaults;
  const data = value as Record<string, unknown>;
  return {
    lang:      typeof data.lang === 'string' && data.lang.length > 0 ? data.lang as Locale : defaults.lang,
    version:   typeof data.version === 'string' && data.version.length > 0 ? data.version : defaults.version,
    zones:     Array.isArray(data.zones) ? data.zones.filter((z): z is ImageZone => typeof z === 'string') : defaults.zones,
    templates: Array.isArray(data.templates) ? data.templates.filter((t): t is ImageTemplate => typeof t === 'string') : defaults.templates,
    premiums:  Array.isArray(data.premiums) ? data.premiums.filter((p): p is ImagePremium => typeof p === 'string') : defaults.premiums,
    limit:     typeof data.limit === 'string' && data.limit.length > 0 ? data.limit : defaults.limit,
    scale:     typeof data.scale === 'string' && ['single', 'batch', 'full'].includes(data.scale) ? data.scale as ImageScale : defaults.scale,
    singleCardMode: typeof data.singleCardMode === 'string' && ['cardId', 'renderHash'].includes(data.singleCardMode) ? data.singleCardMode as SingleCardMode : defaults.singleCardMode,
    singleCardInput: typeof data.singleCardInput === 'string' ? data.singleCardInput : defaults.singleCardInput,
  };
}

function persistImagePageState() {
  try {
    const payload: ImagePageState = {
      lang:      form.lang,
      version:   form.version,
      zones:     form.zones,
      templates: form.templates,
      premiums:  form.premiums,
      limit:     form.limit,
      scale:     scale.value,
      singleCardMode: singleCardMode.value,
      singleCardInput: singleCardInput.value,
    };
    window.localStorage.setItem(IMAGE_PAGE_STATE_KEY, JSON.stringify(payload));
  } catch {
    // no-op
  }
}

function restoreImagePageState() {
  try {
    const raw = window.localStorage.getItem(IMAGE_PAGE_STATE_KEY);
    if (!raw) return;
    const state = normalizeImagePageState(JSON.parse(raw));
    form.lang = state.lang;
    form.version = state.version;
    form.zones = state.zones.length > 0 ? (state.zones as ImageZone[]) : form.zones;
    form.templates = state.templates.length > 0 ? (state.templates as ImageTemplate[]) : form.templates;
    form.premiums = state.premiums.length > 0 ? (state.premiums as ImagePremium[]) : form.premiums;
    form.limit = state.limit;
    scale.value = state.scale;
    singleCardMode.value = state.singleCardMode;
    singleCardInput.value = state.singleCardInput;
  } catch {
    localStorage.removeItem(IMAGE_PAGE_STATE_KEY);
  }
}

// ── Watchers ──

watch(
  [
    () => form.lang,
    () => form.version,
    () => form.zones,
    () => form.templates,
    () => form.premiums,
    () => form.limit,
    () => scale.value,
    () => singleCardMode.value,
    () => singleCardInput.value,
  ],
  () => {
    persistImagePageState();
  },
  { deep: true },
);

onMounted(() => {
  restoreImagePageState();
  void loadImageSettings();
  void loadVersionItems();
  void loadRendererHealth();
  void syncCurrentJob();
});

onActivated(() => {
  void loadImageSettings();
  void loadVersionItems();
  void loadRendererHealth();
});

onUnmounted(() => {
  cleanupJobSubscription();
});
</script>
