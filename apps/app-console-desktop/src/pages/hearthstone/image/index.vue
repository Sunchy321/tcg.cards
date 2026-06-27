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
          <TaskController
            title="图片渲染"
            :operations="operations"
            @completed="onTaskCompleted"
            @failed="onTaskFailed"
          >
            <template #title>
              <div v-if="lastCounts != null" class="flex items-center gap-3 text-sm text-muted ml-auto">
                <span>总数 <span class="font-mono font-semibold text-default">{{ lastCounts.total }}</span></span>
                <span>已有 <span class="font-mono font-semibold text-success">{{ lastCounts.ready }}</span></span>
                <span>缺失 <span class="font-mono font-semibold text-warning">{{ lastCounts.missing }}</span></span>
              </div>
            </template>

            <template #params="{ disabled }">
              <div class="space-y-4">
                <UFormField label="导入规模" orientation="horizontal" :ui="{ root: '!justify-start' }">
                  <UFieldGroup>
                    <UButton v-for="item in scaleItems" :key="item.value" :label="item.label" :color="scale === item.value ? 'primary' : 'neutral'" :variant="scale === item.value ? 'solid' : 'outline'" size="sm" :disabled="disabled" @click="onScaleChange(item.value)" />
                  </UFieldGroup>
                </UFormField>
                <div class="grid gap-4 md:grid-cols-3">
                  <UFormField label="语言" orientation="horizontal" :ui="{ root: '!justify-start' }"><USelect v-model="form.lang" :items="langItems" class="w-40" :disabled="disabled" /></UFormField>
                  <UFormField label="版本" orientation="horizontal" :ui="{ root: '!justify-start' }"><USelect v-model="form.version" :items="versionItems" class="w-40" :disabled="disabled" /></UFormField>
                  <UFormField orientation="horizontal" :ui="{ root: '!justify-start' }">
                    <template #label><span class="cursor-pointer select-none" @click="singleCardMode = singleCardMode === 'cardId' ? 'renderHash' : 'cardId'">{{ singleCardMode === 'cardId' ? 'Card ID' : 'Render Hash' }}</span></template>
                    <UInput v-model="singleCardInput" :placeholder="singleCardMode === 'cardId' ? '输入 cardId...' : '输入 renderHash...'" :disabled="disabled || scale !== 'single'" class="flex-1" />
                  </UFormField>
                </div>
                <div class="grid gap-4 md:grid-cols-3">
                  <UFormField label="展示区域" orientation="horizontal" :ui="{ root: '!justify-start' }">
                    <UFieldGroup>
                      <UButton v-for="item in zoneItems" :key="item.value" :label="item.label" :color="item.disabled ? 'neutral' : form.zones.includes(item.value) ? 'primary' : 'neutral'" :variant="form.zones.includes(item.value) ? 'solid' : 'outline'" size="sm" :disabled="disabled || item.disabled === true" @click="toggleValue(form.zones, item.value)" />
                    </UFieldGroup>
                  </UFormField>
                  <UFormField label="渲染模板" orientation="horizontal" :ui="{ root: '!justify-start' }">
                    <UFieldGroup>
                      <UButton v-for="item in templateItems" :key="item.value" :label="item.label" :color="form.templates.includes(item.value) ? 'primary' : 'neutral'" :variant="form.templates.includes(item.value) ? 'solid' : 'outline'" size="sm" :disabled="disabled" @click="toggleValue(form.templates, item.value)" />
                    </UFieldGroup>
                  </UFormField>
                  <UFormField label="外观品质" orientation="horizontal" :ui="{ root: '!justify-start' }">
                    <UFieldGroup>
                      <UButton v-for="item in premiumItems" :key="item.value" :label="item.label" :color="form.premiums.includes(item.value) ? 'primary' : 'neutral'" :variant="form.premiums.includes(item.value) ? 'solid' : 'outline'" size="sm" :disabled="disabled" @click="toggleValue(form.premiums, item.value)" />
                    </UFieldGroup>
                  </UFormField>
                </div>
                <div class="grid gap-4 md:grid-cols-3">
                  <div /><div />
                  <UFormField label="单次导出数量" orientation="horizontal" :ui="{ root: '!justify-start' }">
                    <UInput v-model="form.limit" type="number" inputmode="numeric" placeholder="默认500，最大2000" :disabled="disabled || scale === 'full'" class="w-40" />
                  </UFormField>
                </div>
              </div>
            </template>

            <template #actions>
              <UButton v-if="scale !== 'single'" label="计算总数" icon="i-lucide-hash" color="neutral" variant="soft" :loading="counting" :disabled="!hasImageConfig || counting" @click="countMatchingImages" />
              <UButton label="渲染预览" icon="i-lucide-eye" color="primary" variant="soft" :loading="actionLoading === 'preview'" :disabled="!hasImageConfig || actionLoading !== null || scale !== 'single' || singleCardInput.trim().length === 0 || form.version === 'all'" @click="executeAction('preview')" />
              <UButton :label="scale === 'batch' ? '导出请求文件' : '生成请求'" icon="i-lucide-code" color="primary" variant="soft" :loading="actionLoading === 'export'" :disabled="!hasImageConfig || actionLoading !== null || scale === 'full' || (scale === 'single' && singleCardInput.trim().length === 0)" @click="executeAction('export')" />
            </template>
          </TaskController>

          <UAlert v-if="taskError" color="error" variant="soft" icon="i-lucide-circle-alert" class="mt-2">
            <pre class="whitespace-pre-wrap text-xs select-all">{{ taskError }}</pre>
          </UAlert>

          <!-- Export requests JSON display -->
          <div v-if="debugRequestResult" class="space-y-2">
            <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{{ debugRequestResult.cardId }}</span>
              <UBadge :label="`set: ${debugRequestResult.set}`" variant="soft" size="xs" />
              <UBadge :label="`type: ${debugRequestResult.type}`" variant="soft" size="xs" />
              <UBadge :label="`techLevel: ${debugRequestResult.techLevel ?? '-'}`" variant="soft" size="xs" />
              <UBadge :label="`${debugRequestResult.variantCount} variant(s)`" variant="soft" size="xs" />
            </div>
            <div v-for="(req, index) in debugRequestResult.requests" :key="req.requestId" class="space-y-1">
              <div class="flex items-center justify-between">
                <div class="text-xs font-medium">{{ req.variant.zone }}.{{ req.variant.template }}.{{ req.variant.premium }}</div>
                <UButton :label="copiedIndex === index ? '已复制' : '复制'" :icon="copiedIndex === index ? 'i-lucide-check' : 'i-lucide-copy'" :color="copiedIndex === index ? 'success' : 'neutral'" variant="ghost" size="xs" @click="copyDebugRequest(index)" />
              </div>
              <pre class="max-h-48 overflow-auto rounded-lg border border-default bg-muted p-2 text-xs"><code>{{ formatDebugRequestJson(req) }}</code></pre>
            </div>
          </div>
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

              <USeparator class="my-1!" />

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

              <USeparator class="my-1!" />

              <div class="flex items-center justify-between gap-2 overflow-hidden">
                <span class="text-muted shrink-0">筛选</span>
                <span class="text-default truncate text-right">{{ summaryText }}</span>
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
import type { TaskPageSnapshot } from '@tcg-cards/model/src/task';
import type { TaskOperation } from '~/components/task/TaskController';

import { useToast } from '@nuxt/ui/composables';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';
import { orpc } from '~/lib/orpc';

import { listLocalHsdataSourceVersions, type HsdataSourceVersionStatus } from '~/composables/useHsdataRepo';
import { getDesktopHearthstoneImageSettings } from '~/composables/useDesktopSettings';
import {
  debugDesktopHearthstoneImageRenderRequest,
  detectDesktopHearthstoneImageRenderer,
  downloadDesktopHearthstoneImageArchive,
  exportDesktopHearthstoneImageRequirements,
  getDesktopHearthstoneImageArchive,
  openDesktopPath,
  triggerDownload,
  triggerJsonDownload,
  previewDesktopHearthstoneImage,
  submitDesktopHearthstoneReimportByRenderHash,
  type DesktopDebugRenderRequestResult,
  type DesktopDownloadArchiveSyncResult,
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
const counting = ref(false);
const pageError = ref('');
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

// ── TaskController ──

function buildTaskInput() {
  const versionRaw = form.version.trim();
  return {
    lang: form.lang,
    ...(versionRaw.length > 0 && versionRaw !== 'latest' && versionRaw !== 'all' ? { version: Number.parseInt(versionRaw, 10) } : {}),
    ...(versionRaw === 'all' ? { allVersions: true } : {}),
    zones: form.zones,
    templates: form.templates,
    premiums: form.premiums,
    limit: Math.min(Number.parseInt(form.limit, 10) || 500, 500),
  };
}

function buildSingleCardInput() {
  const input = singleCardInput.value.trim();
  if (!input) return {};
  return singleCardMode.value === 'cardId' ? { cardId: input } : { renderHash: input };
}

const operations: TaskOperation[] = [
  {
    key: 'render',
    label: '渲染写入存储',
    icon: 'i-lucide-download',
    create: () => orpc.hearthstone.createTask.imageRender({
      ...buildTaskInput(),
      ...(scale.value === 'single' ? buildSingleCardInput() : {}),
      scanAll: scale.value === 'full',
    }) as Promise<TaskPageSnapshot>,
  },
  {
    key: 'download',
    label: '打包下载',
    icon: 'i-lucide-archive',
    color: 'warning',
    create: () => orpc.hearthstone.createTask.imageDownload({
      ...buildTaskInput(),
      ...(scale.value === 'single' ? buildSingleCardInput() : {}),
      scanAll: scale.value === 'full',
    }) as Promise<TaskPageSnapshot>,
  },
];

async function onTaskCompleted(snap: TaskPageSnapshot) {
  if (snap.pageTask.kind === 'attached') {
    // Check if this was a download task — try to get the archive
    try {
      const { archivePath, archiveName } = await orpc.image.getTaskArchive({ taskRunId: snap.pageTask.taskRunId });
      if (archivePath && archiveName) {
        const result = await orpc.image.getArchive({ filePath: archivePath });
        triggerDownload(result.base64Zip, result.fileName);
        toast.add({ title: '下载完成', description: result.fileName, color: 'success' });
        return;
      }
    } catch { /* import task or no archive */ }
  }
  toast.add({ title: '渲染任务完成', color: 'success' });
  countMatchingImages();
}

const taskError = ref('');

function onTaskFailed(_taskRunId: string, _errorCode: string | null, errorMessage: string | null) {
  taskError.value = errorMessage ?? '未知错误';
  toast.add({ title: '渲染任务失败', color: 'error' });
}

interface ImageCounts {
  total: number;
  ready: number;
  missing: number;
}

const lastCounts = ref<ImageCounts | null>(null);

// ── Action dispatcher ──

async function executeAction(outputType: ImageOutputType) {
  actionLoading.value = outputType;
  pageError.value = '';
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
    pageError.value = getConsoleErrorMessage(error, '操作失败');
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
  if (outputType === 'export') {
    const versionRaw = form.version.trim();
    const result = await exportDesktopHearthstoneImageRequirements({
      lang: form.lang,
      ...(versionRaw.length > 0 && versionRaw !== 'latest' && versionRaw !== 'all' ? { version: Number.parseInt(versionRaw, 10) } : {}),
      ...(versionRaw === 'all' ? { allVersions: true } : {}),
      zones: form.zones,
      templates: form.templates,
      premiums: form.premiums,
      limit: Math.min(Number.parseInt(form.limit, 10) || 500, 500),
    });
    triggerJsonDownload(JSON.parse(result.content), result.fileName);
    toast.add({ title: '生成完成', description: result.fileName, color: 'success' });
    return;
  }
}

async function executeFullAction(_outputType: ImageOutputType) {
  // full mode 'write' is handled by TaskController
}

// ── Counting ──

async function countMatchingImages() {
  counting.value = true;
  try {
    const versionRaw = form.version.trim();
    const result = await exportDesktopHearthstoneImageRequirements({
      lang: form.lang,
      ...(versionRaw.length > 0 && versionRaw !== 'latest' && versionRaw !== 'all' ? { version: Number.parseInt(versionRaw, 10) } : {}),
      ...(versionRaw === 'all' ? { allVersions: true } : {}),
      zones: form.zones,
      templates: form.templates,
      premiums: form.premiums,
      limit: Math.min(Number.parseInt(form.limit, 10) || 500, 500),
      scanAll: true,
    });
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
    limit:     (typeof data.limit === 'string' || typeof data.limit === 'number') ? String(data.limit) : defaults.limit,
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
      limit:     String(form.limit),
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
});

onActivated(() => {
  void loadImageSettings();
  void loadVersionItems();
  void loadRendererHealth();
});
</script>
