<template>
  <div class="flex h-full gap-4 overflow-hidden p-4">
    <!-- Sidebar list -->
    <div class="flex w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span class="text-sm font-medium text-slate-700">公告列表</span>
        <div class="flex items-center gap-1">
          <UButton icon="i-lucide-globe" size="xs" variant="ghost" :loading="crawling" @click="handleCrawl" />
          <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="createNew" />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <div
          v-for="item in announcements"
          :key="item.id"
          class="group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors"
          :class="selectedId === item.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-100'"
          @click="selectAnnouncement(item)"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">{{ item.name }}</div>
            <div class="flex items-center gap-1 text-xs text-slate-400">
              <span>{{ item.date }}</span>
              <span>·</span>
              <span>{{ item.source }}</span>
            </div>
          </div>
          <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" class="opacity-0 group-hover:opacity-100" @click.stop="confirmDelete(item)" />
        </div>
        <p v-if="announcements.length === 0 && !loading" class="py-8 text-center text-sm text-slate-400">暂无公告</p>
        <div v-if="loading" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-slate-400" />
        </div>
      </div>
    </div>

    <!-- Edit panel -->
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <template v-if="selectedAnnouncement || isCreating">
        <div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <span class="text-sm text-slate-500">编辑公告</span>
          <div class="flex items-center gap-2">
            <UButton v-if="form.id" icon="i-lucide-wand" label="投影" color="neutral" variant="ghost" size="sm" :loading="projecting" @click="handleProject" />
            <USelect v-model="renderLang" :items="renderLangOptions" class="w-28" />
            <UButton icon="i-lucide-database" label="全部写入存储" color="primary" variant="ghost" size="sm" :loading="renderingAll" :disabled="!form.version" @click="handleRenderAll" />
            <UButton label="取消" color="neutral" variant="ghost" size="sm" @click="resetForm" />
            <UButton label="保存" size="sm" :loading="saving" @click="handleSubmit" />
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-5 space-y-4">
          <div class="grid grid-cols-4 gap-4">
            <UFormField label="来源" required>
              <USelect v-model="form.source" :items="sourceOptions" class="w-full" />
            </UFormField>
            <UFormField label="日期" required>
              <UInput v-model="form.date" type="date" />
            </UFormField>
            <UFormField label="生效日期">
              <UInput v-model="form.effectiveDate" type="date" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="版本" required>
              <USelect v-model="form.version" :items="patchOptions" placeholder="选择版本" class="w-full" />
            </UFormField>
            <UFormField label="对比版本">
              <USelect :model-value="form.lastVersion ?? 'same'" :items="patchOptionsWithEmpty" placeholder="留空则与版本相同" class="w-full" @update:model-value="form.lastVersion = $event === 'same' ? undefined : Number($event)" />
            </UFormField>
          </div>
          <UFormField label="名称" required>
            <UInput v-model="form.name" placeholder="输入公告名称" />
          </UFormField>
          <UFormField label="链接">
            <div class="space-y-2">
              <div v-for="(link, index) in form.link" :key="index" class="flex gap-2">
                <UInput v-model="link.url" placeholder="URL" class="flex-1" @update:model-value="handleUrlChange(link, $event)" />
                <UInput v-model="link.label" placeholder="标签 (可选)" class="w-32" />
                <UButton icon="i-lucide-external-link" size="sm" color="neutral" variant="ghost" :disabled="!link.url" @click="openUrl(link.url)" />
                <UButton icon="i-lucide-sparkles" size="sm" color="primary" variant="ghost" :class="{ invisible: link.label !== 'blizzard' }" :disabled="!aiConfigured || !link.url" :loading="link._parsing" @click="handleAiParse(index)" />
                <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" @click="removeLink(index)" />
              </div>
              <UButton icon="i-lucide-plus" label="添加链接" variant="ghost" size="sm" @click="addLink" />
            </div>
          </UFormField>

          <!-- Items -->
          <div class="border-t border-slate-200 pt-4">
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm font-medium text-slate-700">公告条目（{{ form.items.length }}）</span>
              <div class="flex items-center gap-1">
                <UButton icon="i-lucide-trash-2" label="清空" color="error" variant="ghost" size="xs" :disabled="form.items.length === 0" @click="() => { showClearItemsModal = true; }" />
                <UButton icon="i-lucide-plus" label="添加条目" size="xs" @click="addItem" />
              </div>
            </div>
            <div class="space-y-3">
              <div v-for="(item, index) in form.items" :key="item._key" class="relative rounded-lg border border-slate-200 p-3">
                <div class="absolute right-2 top-2 flex items-center gap-0.5">
                  <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="index === 0" @click="moveItem(index, -1)" />
                  <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :disabled="index === form.items.length - 1" @click="moveItem(index, 1)" />
                  <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" @click="removeItem(index)" />
                </div>
                <div class="grid grid-cols-3 gap-x-4 gap-y-3 pr-6">
                  <UFormField label="类型" required>
                    <USelect v-model="item.type" :items="itemTypeOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="状态">
                    <USelect v-model="item.status" :items="statusOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="赛制 (keyword)">
                    <UInput v-model="item.format" placeholder="standard / constructed" class="w-full" />
                  </UFormField>
                  <!-- Non-card types: single ID field row -->
                  <UFormField v-if="idKindOf(item.type) === 'set'" label="系列ID"><UInput v-model="item.setId" /></UFormField>
                  <UFormField v-else-if="idKindOf(item.type) === 'rule'" label="规则ID"><UInput v-model="item.ruleId" /></UFormField>

                  <!-- Card types: identity, glow, and previews -->
                  <template v-if="idKindOf(item.type) === 'card'">
                  <div class="flex min-w-0 flex-col gap-3">
                    <UFormField label="卡牌ID"><UInput v-model="item.cardId" class="w-full" /></UFormField>
                    <UFormField label="关联卡牌">
                      <UInput v-model="item.relatedCardsStr" placeholder="card1, card2" class="w-full" />
                    </UFormField>
                    <UFormField v-if="item.type === 'card_change'" label="分组">
                      <USelect :model-value="item.group ?? 'none'" :items="groupOptions" placeholder="无" class="w-full" @update:model-value="item.group = $event === 'none' ? '' : String($event)" />
                    </UFormField>
                  </div>
                  <div class="flex min-h-52 min-w-0 flex-col">
                    <template v-if="item.type === 'card_update'">
                      <div class="mb-2 flex h-8 items-center justify-between">
                        <span class="text-sm font-medium text-slate-700">高亮</span>
                        <UButton icon="i-lucide-plus" label="添加" size="xs" variant="ghost" :disabled="(item.glow?.length ?? 0) >= glowPart.options.length" @click="addGlow(item)" />
                      </div>
                      <div class="flex flex-1 flex-col gap-2">
                        <div
                          v-for="(entry, glowIndex) in item.glow ?? []"
                          :key="glowIndex"
                          class="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2 rounded border px-2 py-1.5"
                          :style="glowTypeStyle(entry.type)"
                        >
                          <USelect v-model="entry.part" :items="glowPartOptions(item, glowIndex)" class="w-full" />
                          <div class="flex min-w-0 items-center gap-1.5">
                            <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: glowTypeColors[entry.type].color }" />
                            <USelect v-model="entry.type" :items="glowTypeOptions" class="min-w-0 flex-1" />
                          </div>
                          <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" @click="removeGlow(item, glowIndex)" />
                        </div>
                      </div>
                    </template>
                  </div>
                  <div class="row-span-2 flex min-h-52 items-start justify-center gap-3">
                    <div v-for="side in expectedSides(item.type)" :key="side" class="flex flex-col items-center gap-1">
                      <template v-if="findPreview(item._key, side)">
                        <img :src="`data:${findPreview(item._key, side)!.mimeType ?? 'image/webp'};base64,${findPreview(item._key, side)!.base64}`" class="h-44 w-32 rounded border border-slate-200 object-contain" />
                      </template>
                      <div v-else class="flex h-44 w-32 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50">
                        <UIcon name="i-lucide-image" class="size-6 text-slate-300" />
                      </div>
                      <span class="text-xs text-slate-500">{{ side }}</span>
                    </div>
                  </div>
                  <div class="col-span-2 flex flex-wrap items-center gap-1">
                    <UButton icon="i-lucide-eye" label="预览" size="xs" variant="ghost" :loading="previewingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handlePreviewItem(index)" />
                    <UButton icon="i-lucide-download" label="下载 PNG" size="xs" variant="ghost" :loading="downloadingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handleDownloadPng(index)" />
                    <UButton v-if="renderLang === 'all'" icon="i-lucide-file-json" label="下载请求" size="xs" variant="ghost" :loading="requestingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handleRequest(item)" />
                    <template v-else>
                      <UButton
                        v-for="side in expectedSides(item.type)"
                        :key="`request-${side}`"
                        icon="i-lucide-copy"
                        :label="expectedSides(item.type).length === 1 ? '复制请求' : `复制${side === 'prev' ? '前图' : '后图'}请求`"
                        size="xs"
                        variant="ghost"
                        :loading="requestingItems[item._key]"
                        :disabled="!form.version || !item.cardId"
                        @click="handleRequest(item, side)"
                      />
                    </template>
                    <UButton icon="i-lucide-database" label="写入存储" size="xs" variant="ghost" :loading="renderingItems[item._key]" :disabled="!form.version || !item.cardId" @click="handleRenderItem(index)" />
                    <span v-if="renderErrors[item._key]" class="text-xs text-red-500">{{ renderErrors[item._key] }}</span>
                  </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-slate-400">
        <UIcon name="i-lucide-file-text" class="size-10 opacity-50" />
        <p class="text-sm">选择左侧公告进行编辑，或创建新公告</p>
        <UButton icon="i-lucide-plus" label="创建新公告" @click="createNew" />
      </div>
    </div>

    <UModal v-model:open="showClearItemsModal">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-triangle-alert" class="size-5 text-error" />
          <span class="font-medium">清空公告条目</span>
        </div>
      </template>
      <template #body>
        <p class="text-sm text-muted">将移除当前公告的 {{ form.items.length }} 个条目，此操作尚未保存。</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="() => { showClearItemsModal = false; }" />
          <UButton label="确认清空" color="error" @click="confirmClearItems" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', title: '公告管理' });

import { openUrl } from '@tauri-apps/plugin-opener';
import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { glowPart, group as groupEnum } from '#model/hearthstone/schema/announcement';
import type { GlowEntry } from '#model/hearthstone/schema/announcement';
import type { RenderModel } from '#model/hearthstone/schema/entity';
import { mergePreviews, selectPreview, type SidePreview } from '~/utils/announcement-preview';

const client = useDesktopRuntimeClient();

interface LinkEntry { url: string; label?: string; _parsing?: boolean }
/** Stores display-only render model corrections for both sides of an item. */
interface ItemDelta {
  prev?: Partial<RenderModel>;
  curr?: Partial<RenderModel>;
}
interface ItemForm {
  id?: string; _key: string; type: string; effectiveDate: string; format: string;
  status: string; group: string; version?: number; lastVersion?: number;
  cardId: string; setId: string; ruleId: string; relatedCardsStr: string;
  delta: ItemDelta | null; glow: GlowEntry[] | null;
}

const announcements = ref<any[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const isCreating = ref(false);
const saving = ref(false);
const projecting = ref(false);
const aiConfigured = ref(false);
const crawling = ref(false);
const patches = ref<Array<{ buildNumber: number; name: string }>>([]);
const patchOptions = computed(() => patches.value.map(p => ({ label: `${p.buildNumber} · ${p.name}`, value: p.buildNumber })));
const patchOptionsWithEmpty = computed(() => [{ label: '(与版本相同)', value: 'same' }, ...patchOptions.value]);

const RENDER_LANG_KEY = 'hearthstone-announcement-render-lang';
const renderLang = ref<Locale | 'all'>((localStorage.getItem(RENDER_LANG_KEY) as Locale | 'all' | null) ?? 'zhs');
const renderLangOptions = [
  { label: '全部语言', value: 'all' },
  { label: 'en', value: 'en' }, { label: 'zhs', value: 'zhs' },
];
const glowTypeOptions = [
  { label: 'buff', value: 'buff' },
  { label: 'nerf', value: 'nerf' },
  { label: 'rework', value: 'rework' },
  { label: 'neutral', value: 'neutral' },
];
const glowTypeColors: Record<GlowEntry['type'], { color: string; colorize: string; hiColor: string }> = {
  buff:    { color: '#00BA00', colorize: '#9AFF95', hiColor: '#5ED343' },
  nerf:    { color: '#BA0505', colorize: '#FF9595', hiColor: '#D36943' },
  rework:  { color: '#D6A900', colorize: '#FFF09A', hiColor: '#FFD43B' },
  neutral: { color: '#1677C8', colorize: '#9DDCFF', hiColor: '#3B9EFF' },
};
const renderingAll = ref(false);
const showClearItemsModal = ref(false);
const renderingItems = reactive<Record<string, boolean>>({});
const previewingItems = reactive<Record<string, boolean>>({});
const downloadingItems = reactive<Record<string, boolean>>({});
const requestingItems = reactive<Record<string, boolean>>({});
const renderErrors = reactive<Record<string, string>>({});
const renderedItems = reactive<Record<string, boolean>>({});
const itemPreviews = reactive<Record<string, SidePreview[]>>({});

function expectedSides(type: string): string[] {
  if (type === 'card_change') return ['base'];
  if (type === 'card_update') return ['prev', 'curr'];
  return [];
}

function findPreview(itemKey: string, side: string): SidePreview | undefined {
  return selectPreview(itemPreviews[itemKey] ?? [], side, renderLang.value);
}

function persistRenderLang() {
  localStorage.setItem(RENDER_LANG_KEY, renderLang.value);
}
watch(renderLang, () => {
  persistRenderLang();
  void loadExistingImages();
});

/** Creates the shared runtime input for one item operation. */
function itemOperationInput(item: ItemForm, langs: Locale[]) {
  return {
    item: {
      itemKey: item._key, type: item.type, cardId: item.cardId, format: item.format,
      version: item.version ?? null, lastVersion: item.lastVersion ?? null,
      delta: item.delta, glow: item.glow,
    },
    version: form.version!,
    lastVersion: form.lastVersion ?? null,
    langs,
  };
}

/** Downloads one base64 payload through a temporary browser URL. */
function downloadBase64(base64: string, fileName: string, type: string) {
  const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Renders previews without writing image assets. */
async function handlePreviewItem(index: number) {
  const item = form.items[index];
  if (!item?.cardId || !form.version) return;
  previewingItems[item._key] = true;
  delete renderErrors[item._key];
  try {
    const lang = renderLang.value === 'all' ? 'zhs' : renderLang.value;
    const result: any = await client.hearthstone.announcement.previewItem(itemOperationInput(item, [lang]));
    const errors: string[] = [];
    const previews: SidePreview[] = [];
    for (const file of result.files ?? []) {
      if (file.error || !file.base64) errors.push(`${file.side}/${file.lang}: ${file.error ?? '预览失败'}`);
      else previews.push({ side: file.side, lang: file.lang, hash: '', category: '', template: '', base64: file.base64, mimeType: 'image/png' });
    }
    if (previews.length > 0) itemPreviews[item._key] = mergePreviews(itemPreviews[item._key] ?? [], previews);
    if (errors.length > 0) renderErrors[item._key] = errors.join('；');
  } catch (error: any) {
    renderErrors[item._key] = error.message ?? '预览失败';
  } finally {
    delete previewingItems[item._key];
  }
}

/** Downloads side PNG files or one all-language ZIP archive. */
async function handleDownloadPng(index: number) {
  const item = form.items[index];
  if (!item?.cardId || !form.version) return;
  downloadingItems[item._key] = true;
  try {
    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    const result: any = await client.hearthstone.announcement.downloadItemImages(itemOperationInput(item, langs));
    if (result.archive) downloadBase64(result.archive.base64, result.archive.fileName, 'application/zip');
    else for (const file of result.files ?? []) downloadBase64(file.base64, file.fileName, 'image/png');
    if (result.errors?.length) renderErrors[item._key] = result.errors.join('；');
  } catch (error: any) {
    renderErrors[item._key] = error.message ?? '下载失败';
  } finally {
    delete downloadingItems[item._key];
  }
}

/** Copies one side request or downloads an all-language requirements document. */
async function handleRequest(item: ItemForm, side?: string) {
  if (!item.cardId || !form.version) return;
  requestingItems[item._key] = true;
  try {
    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    const result: any = await client.hearthstone.announcement.getRenderRequests(itemOperationInput(item, langs));
    const errors = (result.entries ?? []).filter((entry: any) => entry.error).map((entry: any) => `${entry.side}/${entry.lang}: ${entry.error}`);
    if (errors.length > 0) renderErrors[item._key] = errors.join('；');
    if (renderLang.value === 'all') {
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.requirements, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${item.cardId}-requests.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } else {
      const entry = result.entries?.find((candidate: any) => candidate.side === side && candidate.request);
      if (!entry?.request) throw new Error(result.entries?.find((candidate: any) => candidate.side === side)?.error ?? '无法构建请求');
      await navigator.clipboard.writeText(JSON.stringify(entry.request, null, 2));
      showToast('请求已复制', '', 'success');
    }
  } catch (error: any) {
    renderErrors[item._key] = error.message ?? '请求生成失败';
  } finally {
    delete requestingItems[item._key];
  }
}

async function handleRenderItem(index: number) {
  const item = form.items[index];
  if (!item?.cardId || !form.version) return;
  const itemKey = item._key;
  renderingItems[itemKey] = true;
  delete renderErrors[itemKey];
  try {
    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    console.log('[render] calling renderItems', { cardId: item.cardId, version: form.version, langs });
    const res: any = await client.hearthstone.announcement.renderItems({
      items: [{
        itemKey, type: item.type, cardId: item.cardId, format: item.format,
        version: item.version ?? null, lastVersion: item.lastVersion ?? null,
        delta: item.delta,
        glow: item.glow,
      }],
      version: form.version,
      lastVersion: form.lastVersion ?? null,
      langs,
    });
    await applyRenderResults(item, res.results ?? []);
  } catch (e: any) {
    console.error('[render] failed', e);
    renderErrors[itemKey] = e.message || '渲染失败';
  } finally {
    delete renderingItems[itemKey];
  }
}

async function handleRenderAll() {
  if (!form.version) return;
  renderingAll.value = true;
  try {
    const cardItems = form.items
      .map((item) => {
        if ((item.type === 'card_change' || item.type === 'card_update') && item.cardId) {
          return {
            itemKey: item._key, type: item.type, cardId: item.cardId, format: item.format,
            version: item.version ?? null, lastVersion: item.lastVersion ?? null,
            delta: item.delta,
            glow: item.glow,
          };
        }
        return null;
      })
      .filter(Boolean) as any[];

    if (cardItems.length === 0) return;

    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    const res: any = await client.hearthstone.announcement.renderItems({
      items: cardItems,
      version: form.version,
      lastVersion: form.lastVersion ?? null,
      langs,
    });
    for (const item of form.items) {
      if (cardItems.some(cardItem => cardItem.itemKey === item._key)) {
        await applyRenderResults(item, res.results ?? []);
      }
    }
  } catch (e: any) {
    showToast('渲染失败', e.message, 'error');
  } finally {
    renderingAll.value = false;
  }
}

/** Loads successful render results and preserves previews for failed sides. */
async function applyRenderResults(item: ItemForm, results: any[]) {
  const itemResults = results.filter(result => result.itemKey === item._key);
  const replacements: SidePreview[] = [];
  const errors: string[] = [];
  const template = item.format === 'battlegrounds' ? 'battlegrounds' : 'normal';

  for (const result of itemResults) {
    if (result.error || !result.renderHash) {
      errors.push(`${result.side}/${result.lang}: ${result.error ?? '渲染失败'}`);
      continue;
    }

    try {
      const image: any = await client.hearthstone.announcement.previewImage({
        renderHash: result.renderHash,
        category:   result.category,
        template,
      });
      replacements.push({
        side:     result.side,
        lang:     result.lang,
        hash:     result.renderHash,
        category: result.category,
        template,
        base64:   image.base64,
      });
    } catch (error: any) {
      errors.push(`${result.side}/${result.lang}: ${error.message ?? '预览读取失败'}`);
    }
  }

  if (replacements.length > 0) {
    itemPreviews[item._key] = mergePreviews(itemPreviews[item._key] ?? [], replacements);
  }

  if (errors.length > 0) renderErrors[item._key] = errors.join('；');
  else delete renderErrors[item._key];
  renderedItems[item._key] = itemResults.length > 0 && errors.length === 0;
}

const emptyItem = (): ItemForm => ({
  _key: crypto.randomUUID(), type: 'card_update', effectiveDate: '', format: '', status: '',
  group: '', version: undefined, lastVersion: undefined,
  cardId: '', setId: '', ruleId: '', relatedCardsStr: '',
  delta: null, glow: null,
});

/** Appends an editable glow marker to a card update item. */
function addGlow(item: ItemForm) {
  item.glow ??= [];
  const used = new Set(item.glow.map(entry => entry.part));
  const part = glowPart.options.find(candidate => !used.has(candidate));
  if (part) item.glow.push({ part, type: 'buff' });
}

/** Lists fixed glow parts while preventing duplicate selections within an item. */
function glowPartOptions(item: ItemForm, index: number) {
  const used = new Set((item.glow ?? []).filter((_, entryIndex) => entryIndex !== index).map(entry => entry.part));
  return glowPart.options.map(part => ({ label: part, value: part, disabled: used.has(part) }));
}

/** Applies the renderer's selected glow palette to one editor row. */
function glowTypeStyle(type: GlowEntry['type']) {
  const colors = glowTypeColors[type];
  return {
    color:           colors.color,
    borderColor:     colors.hiColor,
    backgroundColor: `${colors.colorize}33`,
  };
}

/** Removes a glow marker and normalizes an empty collection back to null. */
function removeGlow(item: ItemForm, index: number) {
  item.glow?.splice(index, 1);
  if (item.glow?.length === 0) item.glow = null;
}

/** Clears all preview-related state for one form item. */
function clearItemPreviewState(itemKey: string) {
  delete itemPreviews[itemKey];
  delete renderingItems[itemKey];
  delete previewingItems[itemKey];
  delete downloadingItems[itemKey];
  delete requestingItems[itemKey];
  delete renderErrors[itemKey];
  delete renderedItems[itemKey];
}

/** Clears preview-related state when the active announcement changes. */
function clearPreviewState() {
  for (const itemKey of new Set([
    ...Object.keys(itemPreviews),
    ...Object.keys(renderingItems),
    ...Object.keys(previewingItems),
    ...Object.keys(downloadingItems),
    ...Object.keys(requestingItems),
    ...Object.keys(renderErrors),
    ...Object.keys(renderedItems),
  ])) {
    clearItemPreviewState(itemKey);
  }
}

/** Clears all form items and their transient preview state after confirmation. */
function confirmClearItems() {
  clearPreviewState();
  form.items = [];
  showClearItemsModal.value = false;
}

// Entity references are mutually exclusive by item type (see proposals/game-change-history §2.6).
function idKindOf(type: string): 'card' | 'set' | 'rule' | null {
  if (type === 'card_change' || type === 'card_update') return 'card';
  if (type === 'set_change') return 'set';
  if (type === 'rule_change') return 'rule';
  return null;
}

const form = reactive({
  id: '', source: 'blizzard', date: '',
  effectiveDate: '', version: undefined as number | undefined,
  lastVersion: undefined as number | undefined, name: '',
  link: [] as LinkEntry[], items: [] as ItemForm[],
});

const selectedAnnouncement = computed(() => announcements.value.find(a => a.id === selectedId.value) ?? null);

const sourceOptions = [{ label: 'Blizzard', value: 'blizzard' }, { label: '系列发售', value: 'release' }];

const itemTypeOptions = [
  { label: 'card_change', value: 'card_change' }, { label: 'card_update', value: 'card_update' },
  { label: 'set_change', value: 'set_change' }, { label: 'rule_change', value: 'rule_change' },
  { label: 'format_birth', value: 'format_birth' }, { label: 'format_death', value: 'format_death' },
];

const GROUP_LABELS: Record<string, string> = {
  core_rotation: '核心系列轮替',
  bg_rotation: '酒馆战棋轮替',
};

const groupOptions = [
  { label: '无', value: 'none' },
  ...groupEnum.options.map(v => ({ label: GROUP_LABELS[v] ?? v, value: v })),
];

const statusOptions = [
  { label: 'buff', value: 'buff' }, { label: 'nerf', value: 'nerf' },
  { label: 'tweak', value: 'tweak' }, { label: 'revert', value: 'revert' },
  { label: 'rework', value: 'rework' }, { label: 'text_fix', value: 'text_fix' },
  { label: 'text_adjust', value: 'text_adjust' }, { label: 'bugged', value: 'bugged' },
  { label: 'bugfix', value: 'bugfix' }, { label: 'banned', value: 'banned' },
  { label: 'banned_in_card_pool', value: 'banned_in_card_pool' }, { label: 'banned_in_deck', value: 'banned_in_deck' },
  { label: 'legal', value: 'legal' }, { label: 'unavailable', value: 'unavailable' },
  { label: 'minor', value: 'minor' }, { label: 'score', value: 'score' },
  { label: 'extend', value: 'extend' },
];

import { useToast } from '@nuxt/ui/composables';
import type { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';
const toast = useToast();

function showToast(title: string, description?: string, color?: 'error' | 'success') {
  toast.add({ title, description, color });
}

function parseRelatedCards(s: string): string[] {
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

function resetForm() {
  clearPreviewState();
  Object.assign(form, {
    id: '', source: 'blizzard', date: '',
    effectiveDate: '', version: undefined, lastVersion: undefined, name: '', link: [], items: [],
  });
  selectedId.value = null; isCreating.value = false;
}

function fillForm(row: any) {
  clearPreviewState();
  Object.assign(form, {
    id: row.id, source: row.source, date: row.date,
    effectiveDate: row.effectiveDate ?? '', version: row.version,
    lastVersion: row.lastVersion ?? undefined, name: row.name,
    link: Array.isArray(row.link) ? row.link : [],
  });
  form.items = (row.items ?? []).map((i: any) => ({
    id: i.id, _key: i.id ?? crypto.randomUUID(), type: i.type ?? 'card_update',
    effectiveDate: i.effectiveDate ?? '', format: i.format ?? '', status: i.status ?? '',
    group: i.group ?? '',
    version: i.version, lastVersion: i.lastVersion,
    cardId: i.cardId ?? '', setId: i.setId ?? '', ruleId: i.ruleId ?? '',
    relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
    delta: i.delta ?? null, glow: i.glow ?? null,
  }));
  isCreating.value = false;
}

function selectAnnouncement(item: any) {
  clearPreviewState();
  selectedId.value = item.id;
  loadDetail(item.id);
}

async function loadDetail(id: string) {
  try {
    const detail: any = await client.hearthstone.announcement.get({ id });
    if (selectedId.value !== id) return;
    fillForm(detail);
    await loadExistingImages();
  } catch (e: any) { showToast('加载详情失败', e.message, 'error'); }
}

async function loadExistingImages() {
  if (!form.version) return;
  const cardItems = form.items.filter(i =>
    (i.type === 'card_change' || i.type === 'card_update') && i.cardId,
  );
  if (cardItems.length === 0) return;

  try {
    const res: any = await client.hearthstone.announcement.getItemImages({
      items: cardItems.map(item => ({
        itemKey: item._key, type: item.type, cardId: item.cardId, format: item.format,
        version: item.version ?? null, lastVersion: item.lastVersion ?? null,
        delta: item.delta,
        glow: item.glow,
      })),
      version: form.version,
      lastVersion: form.lastVersion ?? null,
      langs: renderLang.value === 'all' ? [] : [renderLang.value],
    });

    for (const item of form.items) {
      if (!item?.cardId) continue;
      const images = (res.images ?? []).filter((img: any) => img.itemKey === item._key && img.base64);
      if (images.length === 0) continue;

      itemPreviews[item._key] = images.map((img: any) => ({
        side: img.side, lang: img.lang, hash: '', category: img.category, template: img.template, base64: img.base64,
      }));
      renderedItems[item._key] = true;
    }
  } catch { /* silently skip if images not available */ }
}

function createNew() { resetForm(); isCreating.value = true; }
function addLink() { form.link.push({ url: '', label: '' }); }

const AUTO_LABELS: Record<string, string> = {
  'playhearthstone.com': 'blizzard',
  'hearthstone.blizzard.com': 'blizzard',
  'hs.blizzard.cn': 'blizzard-cn',
};

function deriveLabel(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    for (const [domain, label] of Object.entries(AUTO_LABELS)) {
      if (host === domain || host.endsWith(`.${domain}`)) return label;
    }
  } catch { /* not a valid URL yet */ }
  return null;
}

function handleUrlChange(link: LinkEntry, url: string | number) {
  const derived = deriveLabel(String(url));
  if (!derived) return;
  if (!link.label || Object.values(AUTO_LABELS).includes(link.label)) {
    link.label = derived;
  }
}

async function handleCrawl() {
  crawling.value = true;
  try {
    const result: any = await client.hearthstone.announcement.crawlLinks({});

    resetForm();
    isCreating.value = true;

    form.name = result.name ?? '';
    form.date = result.date || new Date().toISOString().split('T')[0]!;
    form.link = (result.links ?? []).map((l: any) => ({ url: l.url, label: l.label }));
  } catch (e: any) {
    showToast('获取失败', e.message, 'error');
  } finally { crawling.value = false; }
}
function removeLink(i: number) { form.link.splice(i, 1); }
function addItem() { form.items.push(emptyItem()); }
function removeItem(i: number) {
  const item = form.items[i];
  if (item) clearItemPreviewState(item._key);
  form.items.splice(i, 1);
}
function moveItem(from: number, direction: -1 | 1) {
  const to = from + direction;
  if (to < 0 || to >= form.items.length) return;
  const item = form.items.splice(from, 1)[0]!;
  form.items.splice(to, 0, item);
}

async function handleAiParse(index: number) {
  const link = form.link[index];
  if (!link?.url) return;
  link._parsing = true;
  try {
    const result: any = await client.hearthstone.announcement.aiParse({
      name: form.name || undefined,
      links: [{ url: link.url, label: link.label }],
    });

    const header = result.header ?? {};
    if (!form.name && header.name) form.name = header.name;
    if (!form.date && header.date) form.date = header.date;
    if (!form.effectiveDate && header.effectiveDate) form.effectiveDate = header.effectiveDate;
    if (form.version == null && header.version != null) form.version = header.version;

    const items: ItemForm[] = (result.items ?? []).map((i: any) => ({
      _key: crypto.randomUUID(), type: i.type ?? 'card_update', format: i.format ?? '',
      status: i.status ?? '', group: i.group ?? '',
      cardId: i.cardId ?? '', setId: i.setId ?? '', ruleId: i.ruleId ?? '',
      effectiveDate: '', version: undefined, lastVersion: undefined,
      relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
      delta: i.delta ?? null, glow: i.glow ?? null,
    }));
    form.items = [...form.items, ...items];
  } catch (e: any) {
    showToast('AI 解析失败', e.message, 'error');
  } finally { link._parsing = false; }
}

async function loadAnnouncements() {
  loading.value = true;
  try {
    announcements.value = (await client.hearthstone.announcement.list({})) as any[];
  } catch (e: any) { showToast('加载失败', e.message, 'error'); }
  finally { loading.value = false; }
}

async function handleSubmit() {
  if (!form.name.trim()) { showToast('名称不能为空', '', 'error'); return; }
  if (!form.date) { showToast('日期不能为空', '', 'error'); return; }
  if (form.version == null) { showToast('版本不能为空', '', 'error'); return; }
  saving.value = true;
  try {
    const payload = {
      source: form.source, date: form.date, effectiveDate: form.effectiveDate || null,
      version: form.version, lastVersion: form.lastVersion ?? null, name: form.name.trim(),
      link: form.link.filter(l => l.url),
      items: form.items.map(item => {
        const kind = idKindOf(item.type);
        return {
          type: item.type, effectiveDate: item.effectiveDate || null,
          format: item.format || null, status: item.status || null,
          group: item.group || null, version: item.version ?? null, lastVersion: item.lastVersion ?? null,
          cardId: kind === 'card' ? item.cardId || null : null,
          setId: kind === 'set' ? item.setId || null : null,
          ruleId: kind === 'rule' ? item.ruleId || null : null,
          relatedCards: kind === 'card' ? parseRelatedCards(item.relatedCardsStr) : [],
          delta: item.delta, glow: item.glow,
        };
      }),
    };
    if (isCreating.value) {
      await client.hearthstone.announcement.create(payload);
    } else if (form.id) {
      await client.hearthstone.announcement.update({ id: form.id, ...payload });
    }
    showToast('保存成功', '', 'success');
    await loadAnnouncements();
    resetForm();
  } catch (e: any) { showToast('保存失败', e.message, 'error'); }
  finally { saving.value = false; }
}

async function handleProject() {
  if (!form.id) return;
  projecting.value = true;
  try {
    await client.hearthstone.announcement.project({ announcementId: form.id });
    showToast('投影完成', '', 'success');
    await loadDetail(form.id);
  } catch (e: any) { showToast('投影失败', e.message, 'error'); }
  finally { projecting.value = false; }
}

function confirmDelete(item: any) {
  if (confirm(`确定要删除公告"${item.name}"吗？`)) handleDelete(item);
}
async function handleDelete(item: any) {
  try {
    await client.hearthstone.announcement.remove({ id: item.id });
    showToast('删除成功', '', 'success');
    if (selectedId.value === item.id) resetForm();
    await loadAnnouncements();
  } catch (e: any) { showToast('删除失败', e.message, 'error'); }
}

onMounted(async () => {
  await loadAnnouncements();
  try {
    const [health, patchList]: any[] = await Promise.all([
      client.runtime.health(),
      (client.hearthstone.announcement as any).patches(),
    ]);
    aiConfigured.value = !!health.aiConfigured;
    patches.value = patchList ?? [];
    if (patchList?.length > 0) form.version = patchList[0].buildNumber;
  } catch { /* ignore */ }
});
</script>
