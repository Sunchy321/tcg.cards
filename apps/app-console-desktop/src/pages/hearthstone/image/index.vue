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
              <div>
                <div class="font-medium">导出与渲染条件</div>
              </div>
            </template>

            <div class="space-y-4">
              <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div class="space-y-2">
                  <div class="text-xs text-muted">语言</div>
                  <USelect v-model="form.lang" :items="langItems" class="w-full" />
                </div>

                <div class="space-y-2">
                  <div class="text-xs text-muted">版本</div>
                  <USelect
                    v-model="form.version"
                    :items="versionItems"
                    class="w-full"
                  />
                </div>

                <div class="space-y-2 md:col-span-2">
                  <div class="text-xs text-muted">卡牌 ID</div>
                  <UInput
                    v-model="form.cardId"
                    placeholder="留空表示全部卡牌"
                  />
                </div>
              </div>

              <div class="grid gap-4 md:grid-cols-3">
                <div class="space-y-2">
                  <div class="text-xs text-muted">展示区域</div>
                  <div class="space-y-2">
                    <label
                      v-for="item in zoneItems"
                      :key="item.value"
                      class="flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm"
                      :class="item.disabled === true ? 'cursor-not-allowed opacity-50' : ''"
                    >
                      <input
                        :checked="form.zones.includes(item.value)"
                        type="checkbox"
                        :disabled="item.disabled === true"
                        class="size-4 rounded border-default"
                        @change="toggleValue(form.zones, item.value)"
                      >
                      <span class="flex-1">{{ item.label }}</span>
                      <UBadge
                        v-if="item.disabled === true"
                        label="未实现"
                        color="neutral"
                        variant="soft"
                        size="sm"
                      />
                    </label>
                  </div>
                </div>

                <div class="space-y-2">
                  <div class="text-xs text-muted">渲染模板</div>
                  <div class="space-y-2">
                    <label
                      v-for="item in templateItems"
                      :key="item.value"
                      class="flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm"
                    >
                      <input
                        :checked="form.templates.includes(item.value)"
                        type="checkbox"
                        class="size-4 rounded border-default"
                        @change="toggleValue(form.templates, item.value)"
                      >
                      <span>{{ item.label }}</span>
                    </label>
                  </div>
                </div>

                <div class="space-y-2">
                  <div class="text-xs text-muted">外观品质</div>
                  <div class="space-y-2">
                    <label
                      v-for="item in premiumItems"
                      :key="item.value"
                      class="flex items-center gap-2 rounded-lg border border-default px-3 py-2 text-sm"
                    >
                      <input
                        :checked="form.premiums.includes(item.value)"
                        type="checkbox"
                        class="size-4 rounded border-default"
                        @change="toggleValue(form.premiums, item.value)"
                      >
                      <span>{{ item.label }}</span>
                    </label>
                  </div>
                </div>
              </div>

              <UAlert
                color="neutral"
                variant="soft"
                icon="i-lucide-info"
                description="实际导出规则：普通/金卡仅 `hand.normal`；钻石/异画需卡牌具备对应 mechanic；战棋仅 `hand.battlegrounds.normal`；对战区 `play` 暂不导出。"
              />

              <div class="grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <div class="text-xs text-muted">单次导出数量</div>
                  <UInput
                    v-model="form.limit"
                    type="number"
                    inputmode="numeric"
                    placeholder="默认500，最大2000"
                  />
                </div>

                <div class="space-y-2">
                  <div class="text-xs text-muted">继续导出游标</div>
                  <div class="flex gap-2">
                    <UInput
                      v-model="form.cursor"
                      placeholder="留空表示从头开始"
                      class="flex-1"
                    />
                    <UButton
                      label="清空"
                      color="neutral"
                      variant="soft"
                      @click="form.cursor = ''"
                    />
                  </div>
                </div>
              </div>

              <UAlert
                v-if="jobError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="jobError"
              />

              <div
                v-if="currentJob && !isJobTerminal"
                class="space-y-3 rounded-lg border border-default p-4"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <div class="font-medium text-sm">{{ phaseLabel }}</div>
                    <UBadge :label="phaseBadgeColor" variant="soft" size="sm" />
                  </div>
                  <div class="text-xs text-muted">{{ progressCountText }}</div>
                </div>

                <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all duration-300"
                    :style="{ width: `${jobProgressPercent}%` }"
                  />
                </div>

                <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>{{ elapsedText }}</span>
                  <span v-if="jobEtaText.length > 0">{{ jobEtaText }}</span>
                  <span v-if="currentJob.completedCount != null && currentJob.rejectedCount">
                    rejected: {{ currentJob.rejectedCount }}
                  </span>
                </div>
              </div>

              <UAlert
                v-if="currentJob && currentJob.phase === 'completed'"
                color="success"
                variant="soft"
                icon="i-lucide-badge-check"
              >
                <template #description>
                  <div>
                    任务完成
                    <span v-if="currentJob.writtenCount != null">，写入 {{ currentJob.writtenCount }} 个文件</span>
                    <span v-if="currentJob.skippedCount">，跳过 {{ currentJob.skippedCount }} 个</span>
                  </div>
                </template>
              </UAlert>

              <UAlert
                v-if="currentJob && currentJob.phase === 'failed'"
                color="error"
                variant="soft"
                icon="i-lucide-circle-x"
                :description="currentJob.errorMessage ?? '任务执行失败'"
              />

              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  v-if="!currentJob || isJobTerminal"
                  label="开始本地渲染导入"
                  icon="i-lucide-play"
                  color="primary"
                  :loading="submittingJob"
                  :disabled="!hasImageConfig || submittingJob"
                  @click="startJob"
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

          <UCard>
            <template #header>
              <div class="font-medium">调试：生成渲染请求</div>
            </template>

            <div class="space-y-3">
              <div class="space-y-2">
                <div class="text-xs text-muted">Render Hash</div>
                <UInput
                  v-model="debugRenderHash"
                  placeholder="输入 renderHash..."
                />
              </div>

              <p class="text-xs text-muted">
                语言、区域、模板、品质沿用上方「导出与渲染条件」中的选择。
              </p>

              <UButton
                label="生成请求"
                icon="i-lucide-code"
                color="neutral"
                variant="soft"
                :loading="generatingDebugRequest"
                :disabled="debugRenderHash.trim().length === 0"
                block
                @click="generateDebugRequest"
              />

              <UAlert
                v-if="debugRequestError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="debugRequestError"
              />

              <div
                v-if="debugRequestResult"
                class="space-y-2"
              >
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
            </div>
          </UCard>
        </div>

        <div class="space-y-4">
          <UCard>
            <template #header>
              <div class="font-medium">本地配置</div>
            </template>

            <div class="space-y-3">
              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">Renderer Base URL</div>
                <div class="mt-1 break-all font-mono text-sm">{{ imageSettings.rendererBaseUrl ?? '-' }}</div>
              </div>

              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">Bucket Directory</div>
                <div class="mt-1 break-all font-mono text-sm">{{ imageSettings.bucketDir ?? '-' }}</div>
              </div>

              <div class="flex flex-wrap gap-2">
                <UButton
                  label="打开设置"
                  icon="i-lucide-settings"
                  color="neutral"
                  variant="soft"
                  to="/settings/games/hearthstone"
                />
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="font-medium">当前状态</div>
            </template>

            <div class="space-y-3">
              <UAlert
                v-if="hasImageConfig"
                color="success"
                variant="soft"
                icon="i-lucide-circle-check-big"
                description="本地图片配置已就绪，可以继续接入渲染任务执行。"
              />
              <UAlert
                v-else
                color="warning"
                variant="soft"
                icon="i-lucide-triangle-alert"
                description="请先在设置页配置渲染端地址和本地 bucket 根目录。"
              />

              <UDivider />

              <div class="flex items-center justify-between">
                <div class="text-xs font-medium text-default">渲染端状态</div>
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

              <UAlert
                v-if="rendererHealthError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="rendererHealthError"
              />
              <UAlert
                v-else-if="rendererHealth"
                :color="rendererStatusColor"
                variant="soft"
                :icon="rendererReady ? 'i-lucide-badge-check' : rendererHealth.reachable ? 'i-lucide-triangle-alert' : 'i-lucide-plug-zap'"
              >
                <template #description>
                  <div class="space-y-1">
                    <div class="font-medium">状态：{{ rendererStatusText }}</div>
                    <div
                      v-if="rendererHealth.status"
                      class="text-xs space-y-0.5"
                    >
                      <div>service: {{ rendererHealth.status.service }}</div>
                      <div>version: {{ rendererHealth.status.version }}</div>
                      <div>protocol: {{ rendererHealth.status.protocolVersion }}</div>
                      <div>requestShape: {{ rendererHealth.status.requestShape }}</div>
                      <div v-if="rendererHealth.status.message">
                        message: {{ rendererHealth.status.message }}
                      </div>
                    </div>
                    <div v-else-if="rendererHealth.configured && !rendererHealth.reachable" class="text-xs">
                      {{ rendererHealth.error }}
                    </div>
                  </div>
                </template>
              </UAlert>

              <UDivider />

              <div class="rounded-lg border border-default p-3">
                <div class="text-xs text-muted">筛选摘要</div>
                <div class="mt-1 text-sm text-default">
                  {{ summaryText }}
                </div>
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

import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { listLocalHsdataSourceVersions, type HsdataSourceVersionStatus } from '~/composables/useHsdataRepo';
import { getDesktopHearthstoneImageSettings } from '~/composables/useDesktopSettings';
import {
  debugDesktopHearthstoneImageRenderRequest,
  detectDesktopHearthstoneImageRenderer,
  openDesktopPath,
  submitDesktopHearthstoneImageJob,
  watchDesktopImageJobProgress,
  type DesktopDebugRenderRequestResult,
  type DesktopHearthstoneImageJob,
  type DesktopImageJobProgressEvent,
  type DesktopRendererHealthResult,
} from '~/composables/useDesktopRuntimeClient';

definePageMeta({
  layout: 'admin',
  title:  '卡牌图片导入',
});

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
  cardId:    '',
  version:   'latest',
  zones:     ['hand'] as ImageZone[],
  templates: ['normal', 'battlegrounds'] as ImageTemplate[],
  premiums:  ['normal', 'golden', 'diamond', 'signature'] as ImagePremium[],
  limit:     '500',
  cursor:    '',
});

const loadingConfig = ref(false);
const configError = ref('');
const submittingJob = ref(false);
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

/** Returns one trimmed config value or null when the input is blank. */
function normalizeConfigValue(value: string | null | undefined) {
  const nextValue = value?.trim() ?? '';
  return nextValue.length > 0 ? nextValue : null;
}

/** Returns one normalized image-settings snapshot from the desktop runtime payload. */
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

  if (imageSettings.value.rendererBaseUrl == null) {
    missing.push('Renderer Base URL');
  }

  if (imageSettings.value.bucketDir == null) {
    missing.push('Bucket Directory');
  }

  return missing.join(' / ');
});

const summaryText = computed(() => {
  const zones = form.zones.join(', ') || '-';
  const templates = form.templates.join(', ') || '-';
  const premiums = form.premiums.join(', ') || '-';
  const version = form.version.trim().length > 0 ? form.version.trim() : 'latest';
  const cardId = form.cardId.trim().length > 0 ? form.cardId.trim() : 'all';

  return `lang=${form.lang} / version=${version} / cardId=${cardId} / zone=${zones} / template=${templates} / premium=${premiums}`;
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

const rendererStatusColor = computed(() => {
  if (rendererReady.value) return 'success';
  if (rendererHealthError.value.length > 0) return 'error';
  if (rendererHealth.value?.reachable === false || rendererHealth.value?.configured === false) return 'error';
  if (rendererHealth.value?.status?.ready === false) return 'warning';
  return 'neutral';
});

const isJobTerminal = computed(() => (
  currentJob.value?.phase === 'completed' || currentJob.value?.phase === 'failed'
));

const phaseLabels: Record<string, string> = {
  exporting_requirements:    '正在导出图片需求清单...',
  submitting_renderer_job:   '正在渲染卡图...',
  importing_local_bucket:    '正在导入本地 bucket...',
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
  return 'info';
});

const jobProgressPercent = computed(() => {
  const total = currentJob.value?.totalCount;
  const completed = currentJob.value?.completedCount;
  if (total == null || total === 0 || completed == null) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
});

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

/** Builds the API input from the current form values. */
function buildJobInput(): { lang: string; cardId?: string; version?: number; zones: string[]; templates: string[]; premiums: string[]; limit: number; cursor?: string | null } {
  const versionRaw = form.version.trim();
  const cursorRaw = form.cursor.trim();
  return {
    lang:      form.lang,
    ...(form.cardId.trim().length > 0 ? { cardId: form.cardId.trim() } : {}),
    ...(versionRaw.length > 0 && versionRaw !== 'latest' ? { version: Number.parseInt(versionRaw, 10) } : {}),
    zones:     form.zones,
    templates: form.templates,
    premiums:  form.premiums,
    limit:     Math.min(Number.parseInt(form.limit, 10) || 500, 500),
    ...(cursorRaw.length > 0 ? { cursor: cursorRaw } : {}),
  };
}

/** Submits one local render import job and subscribes to the progress stream. */
async function startJob() {
  submittingJob.value = true;
  jobError.value = '';
  cleanupJobSubscription();

  try {
    const result = await submitDesktopHearthstoneImageJob(buildJobInput());
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
  }
}

/** Applies one progress event to the current job ref. */
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
  currentJob.value = { ...state };
  if (isJobTerminal.value) stopProgressClock();
}

/** Cleans up the active progress stream subscription. */
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

/** Clears the current job so the user can start a new one. */
function resetJob() {
  cleanupJobSubscription();
  currentJob.value = null;
  jobError.value = '';
}

/** Loads the saved Hearthstone image settings from the desktop runtime. */
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

/** Checks the configured image renderer health and reports its status. */
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

/** Loads completed hsdata builds for the desktop version selector. */
async function loadVersionItems() {
  try {
    const rows = await listLocalHsdataSourceVersions();
    const builds = rows
      .filter((row: HsdataSourceVersionStatus) => row.importStatus === 'completed' && row.build != null)
      .map(row => row.build!);
    const uniqueBuilds = [...new Set(builds)].sort((a, b) => b - a);

    versionItems.value = [
      { label: 'latest', value: 'latest' },
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

/** Restores the desktop image page form to its default values. */
function resetForm() {
  form.lang = 'zhs';
  form.cardId = '';
  form.version = 'latest';
  form.zones = ['hand'];
  form.templates = ['normal'];
  form.premiums = ['normal'];
  form.limit = '500';
  form.cursor = '';
}

/** Toggles one checkbox value while keeping at least one item selected. */
function toggleValue<T>(list: T[], value: T) {
  const index = list.indexOf(value);

  if (index >= 0) {
    if (list.length > 1) {
      list.splice(index, 1);
    }

    return;
  }

  list.push(value);
}

const debugRenderHash = ref('');
const generatingDebugRequest = ref(false);
const debugRequestError = ref('');
const debugRequestResult = ref<DesktopDebugRenderRequestResult | null>(null);
const copiedIndex = ref<number | null>(null);

async function generateDebugRequest() {
  generatingDebugRequest.value = true;
  debugRequestError.value = '';
  debugRequestResult.value = null;

  try {
    debugRequestResult.value = await debugDesktopHearthstoneImageRenderRequest({
      renderHash: debugRenderHash.value.trim(),
      lang:       form.lang,
      zones:      form.zones,
      templates:  form.templates,
      premiums:   form.premiums,
    });
  } catch (error) {
    console.error('Failed to generate debug render request:', error);
    debugRequestError.value = getConsoleErrorMessage(error, '生成失败');
  } finally {
    generatingDebugRequest.value = false;
  }
}

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

onMounted(() => {
  void loadImageSettings();
  void loadVersionItems();
  void loadRendererHealth();
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
