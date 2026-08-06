<template>
  <div class="flex h-full gap-4">
    <!-- Sidebar list -->
    <div class="sticky top-0 flex max-h-[calc(100vh-6rem)] w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
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
    <div class="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white">
      <template v-if="selectedAnnouncement || isCreating">
        <div class="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-slate-200 bg-white px-5 py-3">
          <span class="text-sm text-slate-500">编辑公告</span>
          <div class="flex items-center gap-2">
            <UButton v-if="form.id" icon="i-lucide-wand" label="投影" color="neutral" variant="ghost" size="sm" :loading="projecting" @click="handleProject" />
            <USelect v-model="renderLang" :items="renderLangOptions" class="w-28" />
            <UButton icon="i-lucide-database" label="全部写入存储" color="primary" variant="ghost" size="sm" :loading="renderingAll" :disabled="!form.version" @click="handleRenderAll" />
            <UButton
              :icon="isTextMode ? 'i-lucide-form-input' : 'i-lucide-file-code'"
              :label="isTextMode ? '表单模式' : '文本编辑'"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="toggleTextMode"
            />
            <UButton v-if="!isTextMode" icon="i-lucide-plus" label="添加条目" color="primary" variant="soft" size="sm" @click="addItem" />
            <UButton label="取消" color="neutral" variant="ghost" size="sm" @click="resetForm" />
            <UButton label="保存" size="sm" :loading="saving" @click="handleSubmit" />
          </div>
        </div>
          <div class="p-5 space-y-4">
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
            <div v-if="!isTextMode" class="mb-3 flex items-center justify-between">
              <span class="text-sm font-medium text-slate-700">公告条目（{{ form.items.length }}）</span>
              <div class="flex items-center gap-1">
                <UButton v-if="form.items.length > 1" icon="i-lucide-arrow-up-down" label="排序" size="xs" variant="ghost" @click="openSortModal" />
                <UButton icon="i-lucide-trash-2" label="清空" color="error" variant="ghost" size="xs" :disabled="form.items.length === 0" @click="() => { showClearItemsModal = true; }" />
              </div>
            </div>
            <AnnouncementItemTextEditor
              v-if="isTextMode"
              v-model="yamlText"
              :search="textSearch"
              class="h-[70vh]"
              @parsed="handleTextParsed"
            />
            <UScrollArea v-else :items="form.items" :virtualize="itemVirtualizeOptions" class="max-h-[70vh]">
              <template #default="{ item, index }">
              <div :key="item._key" class="relative rounded-lg border border-slate-200 p-3">
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
                    <UFormField label="卡牌ID"><CardSearchSelect v-model="item.cardId" :search="searchCards" :resolve="batchedResolveCardNames" /></UFormField>
                    <UFormField label="关联卡牌">
                      <CardSearchSelect v-model="item.relatedCardsStr" multiple :search="searchCards" :resolve="batchedResolveCardNames" placeholder="搜索并选择关联卡牌" />
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
                      <CardImage
                        class="w-32"
                        :src="previewSrc(item._key, side)"
                        :card-id="item.cardId"
                        :version="form.version ?? 0"
                        :type="cardMetaOf(item)?.type ?? 'minion'"
                        :variant="item.format === 'battlegrounds' ? 'battlegrounds' : 'normal'"
                        :mechanics="cardMetaOf(item)?.mechanics"
                      />
                      <span
                        class="text-xs"
                        :class="previewSourceOf(item._key, side) === 'preview' ? 'font-medium text-amber-600' : 'text-slate-500'"
                      >{{ side }}</span>
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
              </template>
            </UScrollArea>
          </div>
        </div>
      </template>
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-slate-400">
        <UIcon name="i-lucide-file-text" class="size-10 opacity-50" />
        <p class="text-sm">选择左侧公告进行编辑，或创建新公告</p>
        <UButton icon="i-lucide-plus" label="创建新公告" @click="createNew" />
      </div>
    </div>

    <UModal v-model:open="sortModalOpen" title="排序公告条目" class="sm:max-w-5xl">
      <template #body>
        <p class="mb-3 text-sm text-slate-500">拖动方块调整条目顺序，调整结果会应用到编辑表单。</p>
        <VueDraggable
          v-model="form.items"
          handle=".drag-handle"
          :animation="150"
          class="grid max-h-[70vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5"
        >
          <div
            v-for="(item, index) in form.items"
            :key="item._key"
            class="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 p-2.5"
            :class="typeColor(item.type).tile"
          >
            <div class="flex items-center gap-1.5">
              <UIcon name="i-lucide-grip-vertical" class="drag-handle size-4 shrink-0 cursor-grab text-slate-400" />
              <span class="shrink-0 text-xs text-slate-400">{{ index + 1 }}</span>
              <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px]" :class="typeColor(item.type).pill">{{ item.type }}</span>
            </div>
            <div class="truncate text-sm font-medium">{{ tileTitle(item) }}</div>
            <div class="truncate text-xs text-slate-400">{{ tileMeta(item) }}</div>
          </div>
        </VueDraggable>
        <p v-if="form.items.length === 0" class="py-6 text-center text-sm text-slate-400">暂无条目</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="cancelSort" />
          <UButton label="确定" color="primary" @click="{ sortModalOpen = false; }" />
        </div>
      </template>
    </UModal>

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
import { openUrl } from '@tauri-apps/plugin-opener';
import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { glowPart, group as groupEnum } from '#model/hearthstone/schema/announcement';
import type { GlowEntry } from '#model/hearthstone/schema/announcement';
import type { RenderModel } from '#model/hearthstone/schema/entity';
import { mergePreviews, selectPreview, type SidePreview } from '~/utils/announcement-preview';
import { idKindOf, serializeItems, type ParseError, type ParsedResult, type ResolvedCardName, type TextItem } from '~/utils/announcement-yaml';

import { useToast } from '@nuxt/ui/composables';
import type { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

definePageMeta({ layout: 'admin', title: '公告管理' });

const client = useDesktopRuntimeClient();

interface LinkEntry { url: string, label?: string, _parsing?: boolean }
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
const patches = ref<Array<{ buildNumber: number, name: string }>>([]);
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
const glowTypeColors: Record<GlowEntry['type'], { color: string, colorize: string, hiColor: string }> = {
  buff:    { color: '#00BA00', colorize: '#9AFF95', hiColor: '#5ED343' },
  nerf:    { color: '#BA0505', colorize: '#FF9595', hiColor: '#D36943' },
  rework:  { color: '#D6A900', colorize: '#FFF09A', hiColor: '#FFD43B' },
  neutral: { color: '#1677C8', colorize: '#9DDCFF', hiColor: '#3B9EFF' },
};
const renderingAll = ref(false);
const showClearItemsModal = ref(false);
const sortModalOpen = ref(false);
const sortSnapshot = ref<ItemForm[]>([]);
const isTextMode = ref(false);
const yamlText = ref('');
const textErrors = ref<ParseError[]>([]);
const textPendingCount = ref(0);
const renderingItems = reactive<Record<string, boolean>>({});
const previewingItems = reactive<Record<string, boolean>>({});
const downloadingItems = reactive<Record<string, boolean>>({});
const requestingItems = reactive<Record<string, boolean>>({});
const renderErrors = reactive<Record<string, string>>({});
const renderedItems = reactive<Record<string, boolean>>({});
const itemPreviews = reactive<Record<string, SidePreview[]>>({});
const cardMetas = reactive<Record<string, { type: string, mechanics: Record<string, boolean | number>, name: string | null }>>({});

function expectedSides(type: string): string[] {
  if (type === 'card_change') return ['base'];
  if (type === 'card_update') return ['prev', 'curr'];
  return [];
}

function findPreview(itemKey: string, side: string): SidePreview | undefined {
  return selectPreview(itemPreviews[itemKey] ?? [], side, renderLang.value);
}

/** Desktop runtime origin, matching the RPC client's http://localhost:4318/rpc. */
const DESKTOP_IMAGE_BASE = 'http://localhost:4318';

/** Builds the runtime image URL for a stored card image by render hash. */
function buildImageUrl(hash: string, category: string, template: string): string {
  return `${DESKTOP_IMAGE_BASE}/images/${category}/hand/${template}/normal/${hash.slice(0, 2)}/${hash}.webp?1`;
}

/** Resolves a preview side to a URL (storage) or data URL (transient render). */
function previewSrc(itemKey: string, side: string): string | null {
  const preview = findPreview(itemKey, side);
  if (!preview) return null;
  if (preview.source === 'storage' && preview.hash) {
    return buildImageUrl(preview.hash, preview.category, preview.template);
  }
  return `data:${preview.mimeType ?? 'image/webp'};base64,${preview.base64}`;
}

/** Returns the source of the current preview for an item side, or null when none is loaded. */
function previewSourceOf(itemKey: string, side: string): SidePreview['source'] | null {
  return findPreview(itemKey, side)?.source ?? null;
}

/** Returns the cached type and mechanics for an item's card, or null when unknown. */
function cardMetaOf(item: ItemForm) {
  return item.cardId ? (cardMetas[item.cardId] ?? null) : null;
}

let cardMetaBatch: string[] = [];
let cardMetaTimer: ReturnType<typeof setTimeout> | null = null;

/** Fetches card metadata in a single batched RPC per tick, cached per cardId. */
function ensureCardMeta(cardId: string) {
  if (!cardId || cardMetas[cardId]) return;
  cardMetaBatch.push(cardId);
  if (cardMetaTimer) return;
  cardMetaTimer = setTimeout(() => {
    cardMetaTimer = null;
    const ids = [...new Set(cardMetaBatch)];
    cardMetaBatch = [];
    void (async () => {
      try {
        const lang = renderLang.value === 'all' ? 'zhs' : renderLang.value;
        const result = await client.hearthstone.announcement.cardMetas({ cardIds: ids, lang });
        for (const id of ids) {
          const meta = result[id];
          if (meta) cardMetas[id] = meta;
        }
      } catch { /* fall back to the minion placeholder when metadata is missing */ }
    })();
  }, 0);
}

/** Searches cards by English/Chinese name or cardId for the CardSearchSelect widget. */
function searchCards(query: string) {
  return client.hearthstone.announcement.searchCards({ q: query });
}

interface ResolveWaiter {
  ids:     string[];
  resolve: (rows: ResolvedCardName[]) => void;
}

let resolveBatchIds: string[] = [];
let resolveWaiters: ResolveWaiter[] = [];
let resolveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Batches cardId→name lookups from many CardSearchSelect rows into one RPC per
 * tick. Without this, each row fires its own resolve call, flooding the runtime
 * when an announcement holds dozens of card items.
 */
function batchedResolveCardNames(cardIds: string[]): Promise<ResolvedCardName[]> {
  return new Promise(res => {
    resolveBatchIds.push(...cardIds);
    resolveWaiters.push({ ids: cardIds, resolve: res });
    if (resolveTimer) return;
    resolveTimer = setTimeout(() => {
      resolveTimer = null;
      const ids = [...new Set(resolveBatchIds)];
      const waiters = resolveWaiters;
      resolveBatchIds = [];
      resolveWaiters = [];
      void (async () => {
        try {
          const rows = await client.hearthstone.announcement.resolveCardNames({ cardIds: ids });
          const byId = new Map(rows.map(r => [r.cardId, r]));
          for (const waiter of waiters) {
            waiter.resolve(waiter.ids.map(id => byId.get(id)).filter((r): r is ResolvedCardName => !!r));
          }
        } catch {
          for (const waiter of waiters) waiter.resolve([]);
        }
      })();
    }, 0);
  });
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
      itemKey:     item._key, type:        item.type, cardId:      item.cardId, format:      item.format,
      version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
      delta:       item.delta, glow:        item.glow,
    },
    version:     form.version!,
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
  Reflect.deleteProperty(renderErrors, item._key);
  try {
    const lang = renderLang.value === 'all' ? 'zhs' : renderLang.value;
    const result: any = await client.hearthstone.announcement.previewItem(itemOperationInput(item, [lang]));
    const errors: string[] = [];
    const previews: SidePreview[] = [];
    for (const file of result.files ?? []) {
      if (file.error || !file.base64) errors.push(`${file.side}/${file.lang}: ${file.error ?? '预览失败'}`);
      else previews.push({ side: file.side, lang: file.lang, hash: '', category: '', template: '', base64: file.base64, mimeType: 'image/png', source: 'preview' });
    }
    if (previews.length > 0) itemPreviews[item._key] = mergePreviews(itemPreviews[item._key] ?? [], previews);
    if (errors.length > 0) renderErrors[item._key] = errors.join('；');
  } catch (error: any) {
    renderErrors[item._key] = error.message ?? '预览失败';
  } finally {
    Reflect.deleteProperty(previewingItems, item._key);
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
    Reflect.deleteProperty(downloadingItems, item._key);
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
    Reflect.deleteProperty(requestingItems, item._key);
  }
}

async function handleRenderItem(index: number) {
  const item = form.items[index];
  if (!item?.cardId || !form.version) return;
  const itemKey = item._key;
  renderingItems[itemKey] = true;
  Reflect.deleteProperty(renderErrors, itemKey);
  try {
    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    console.log('[render] calling renderItems', { cardId: item.cardId, version: form.version, langs });
    const res: any = await client.hearthstone.announcement.renderItems({
      items: [{
        itemKey, type:        item.type, cardId:      item.cardId, format:      item.format,
        version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
        delta:       item.delta,
        glow:        item.glow,
      }],
      version:     form.version,
      lastVersion: form.lastVersion ?? null,
      langs,
    });
    await applyRenderResults(item, res.results ?? []);
  } catch (e: any) {
    console.error('[render] failed', e);
    renderErrors[itemKey] = e.message || '渲染失败';
  } finally {
    Reflect.deleteProperty(renderingItems, itemKey);
  }
}

async function handleRenderAll() {
  if (!form.version) return;
  renderingAll.value = true;
  try {
    const cardItems = form.items
      .map(item => {
        if ((item.type === 'card_change' || item.type === 'card_update') && item.cardId) {
          return {
            itemKey:     item._key, type:        item.type, cardId:      item.cardId, format:      item.format,
            version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
            delta:       item.delta,
            glow:        item.glow,
          };
        }
        return null;
      })
      .filter(Boolean) as any[];

    if (cardItems.length === 0) return;

    const langs = renderLang.value === 'all' ? [] : [renderLang.value];
    const res: any = await client.hearthstone.announcement.renderItems({
      items:       cardItems,
      version:     form.version,
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

    // The render wrote the image into the bucket; the <img> loads it via URL,
    // so no base64 round-trip or extra read is needed here.
    replacements.push({
      side:     result.side,
      lang:     result.lang,
      hash:     result.renderHash,
      category: result.category,
      template,
      base64:   '',
      source:   'storage',
    });
  }

  if (replacements.length > 0) {
    itemPreviews[item._key] = mergePreviews(itemPreviews[item._key] ?? [], replacements);
  }

  if (errors.length > 0) renderErrors[item._key] = errors.join('；');
  else Reflect.deleteProperty(renderErrors, item._key);
  renderedItems[item._key] = itemResults.length > 0 && errors.length === 0;
}

const emptyItem = (): ItemForm => ({
  _key:            crypto.randomUUID(), type:            'card_update', effectiveDate:   '', format:          '', status:          '',
  group:           '', version:         undefined, lastVersion:     undefined,
  cardId:          '', setId:           '', ruleId:          '', relatedCardsStr: '',
  delta:           null, glow:            null,
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
  Reflect.deleteProperty(itemPreviews, itemKey);
  Reflect.deleteProperty(renderingItems, itemKey);
  Reflect.deleteProperty(previewingItems, itemKey);
  Reflect.deleteProperty(downloadingItems, itemKey);
  Reflect.deleteProperty(requestingItems, itemKey);
  Reflect.deleteProperty(renderErrors, itemKey);
  Reflect.deleteProperty(renderedItems, itemKey);
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

const form = reactive({
  id:            '', source:        'blizzard', date:          '',
  effectiveDate: '', version:       undefined as number | undefined,
  lastVersion:   undefined as number | undefined, name:          '',
  link:          [] as LinkEntry[], items:         [] as ItemForm[],
});

// Virtual-list sizing for the item cards: card rows are tall, other rows short.
const itemVirtualizeOptions = {
  gap:          12,
  getItemKey:   (index: number) => form.items[index]?._key ?? index,
  estimateSize: (index: number) => {
    const item = form.items[index];
    return item ? (idKindOf(item.type) === 'card' ? 340 : 140) : 200;
  },
};

// Resolves placeholder card metadata for items as soon as their cardIds are known.
watch(
  () => form.items.map(item => item.cardId).filter((id): id is string => !!id),
  ids => {
    for (const id of new Set(ids)) void ensureCardMeta(id);
  },
  { immediate: true },
);

const selectedAnnouncement = computed(() => announcements.value.find(a => a.id === selectedId.value) ?? null);

const sourceOptions = [{ label: 'Blizzard', value: 'blizzard' }, { label: '系列发售', value: 'release' }];

const itemTypeOptions = [
  { label: 'card_change', value: 'card_change' }, { label: 'card_update', value: 'card_update' },
  { label: 'set_change', value: 'set_change' }, { label: 'rule_change', value: 'rule_change' },
  { label: 'format_birth', value: 'format_birth' }, { label: 'format_death', value: 'format_death' },
];

const GROUP_LABELS: Record<string, string> = {
  core_rotation: '核心系列轮替',
  bg_rotation:   '酒馆战棋轮替',
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
    id:            '', source:        'blizzard', date:          '',
    effectiveDate: '', version:       undefined, lastVersion:   undefined, name:          '', link:          [], items:         [],
  });
  selectedId.value = null;
  isCreating.value = false;
  isTextMode.value = false;
  textErrors.value = [];
  textPendingCount.value = 0;
}

function fillForm(row: any) {
  clearPreviewState();
  Object.assign(form, {
    id:            row.id, source:        row.source, date:          row.date,
    effectiveDate: row.effectiveDate ?? '', version:       row.version,
    lastVersion:   row.lastVersion ?? undefined, name:          row.name,
    link:          Array.isArray(row.link) ? row.link : [],
  });
  form.items = (row.items ?? []).map((i: any) => ({
    id:              i.id, _key:            i.id ?? crypto.randomUUID(), type:            i.type ?? 'card_update',
    effectiveDate:   i.effectiveDate ?? '', format:          i.format ?? '', status:          i.status ?? '',
    group:           i.group ?? '',
    version:         i.version, lastVersion:     i.lastVersion,
    cardId:          i.cardId ?? '', setId:           i.setId ?? '', ruleId:          i.ruleId ?? '',
    relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
    delta:           i.delta ?? null, glow:            i.glow ?? null,
  }));
  isCreating.value = false;
  isTextMode.value = false;
  textErrors.value = [];
  textPendingCount.value = 0;
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
        itemKey:     item._key, type:        item.type, cardId:      item.cardId, format:      item.format,
        version:     item.version ?? null, lastVersion: item.lastVersion ?? null,
        delta:       item.delta,
        glow:        item.glow,
      })),
      version:     form.version,
      lastVersion: form.lastVersion ?? null,
      langs:       renderLang.value === 'all' ? [] : [renderLang.value],
    });

    for (const item of form.items) {
      if (!item?.cardId) continue;
      const images = (res.images ?? []).filter((img: any) => img.itemKey === item._key && img.hash);
      if (images.length === 0) continue;

      itemPreviews[item._key] = images.map((img: any) => ({
        side: img.side, lang: img.lang, hash: img.hash, category: img.category, template: img.template, base64: '', source: 'storage',
      }));
      renderedItems[item._key] = true;
    }
  } catch { /* silently skip if images not available */ }
}

function createNew() {
  resetForm();
  isCreating.value = true;
}

function addLink() {
  form.link.push({ url: '', label: '' });
}

const AUTO_LABELS: Record<string, string> = {
  'playhearthstone.com':      'blizzard',
  'hearthstone.blizzard.com': 'blizzard',
  'hs.blizzard.cn':           'blizzard-cn',
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

function removeLink(i: number) {
  form.link.splice(i, 1);
}

/** Appends a new item inheriting type/format/status from the previous one, if any. */
function addItem() {
  const last = form.items[form.items.length - 1];
  form.items.push({
    ...emptyItem(),
    type:   last?.type ?? 'card_update',
    format: last?.format ?? '',
    status: last?.status ?? '',
  });
}

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

/** Converts a form item to the text-mode representation (entity ids stay as cardId). */
function toTextItem(item: ItemForm): TextItem {
  return {
    type:          item.type,
    effectiveDate: item.effectiveDate,
    format:        item.format,
    status:        item.status,
    group:         item.group,
    version:       item.version,
    lastVersion:   item.lastVersion,
    cardId:        item.cardId,
    setId:         item.setId,
    ruleId:        item.ruleId,
    relatedCards:  parseRelatedCards(item.relatedCardsStr),
    delta:         item.delta as Record<string, unknown> | null,
    glow:          item.glow,
  };
}

/** Searches cards for text-mode name resolution with a larger candidate window. */
function textSearch(name: string) {
  return client.hearthstone.announcement.searchCards({ q: name, limit: 50 });
}

/** Whether two items carry the same meaningful content (previews are only valid when equal). */
function sameItem(a: ItemForm, b: ItemForm): boolean {
  return a.type === b.type
    && a.effectiveDate === b.effectiveDate
    && a.format === b.format
    && a.status === b.status
    && a.group === b.group
    && a.version === b.version
    && a.lastVersion === b.lastVersion
    && a.cardId === b.cardId
    && a.setId === b.setId
    && a.ruleId === b.ruleId
    && a.relatedCardsStr === b.relatedCardsStr
    && JSON.stringify(a.delta) === JSON.stringify(b.delta)
    && JSON.stringify(a.glow) === JSON.stringify(b.glow);
}

/** Maps parsed text items back to form items, reusing _keys for unchanged identities. */
function mapParsedToForm(parsedItems: TextItem[]): ItemForm[] {
  const used = new Set<string>();
  const byIdentity = new Map<string, ItemForm>();
  for (const item of form.items) {
    const identity = `${item.type}|${item.cardId}|${item.setId}|${item.ruleId}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, item);
  }
  return parsedItems.map(parsed => {
    const identity = `${parsed.type}|${parsed.cardId}|${parsed.setId}|${parsed.ruleId}`;
    const prev = !used.has(identity) ? byIdentity.get(identity) : undefined;
    if (prev) used.add(identity);
    return {
      id:              prev?.id,
      _key:            prev?._key ?? crypto.randomUUID(),
      type:            parsed.type,
      effectiveDate:   parsed.effectiveDate,
      format:          parsed.format,
      status:          parsed.status,
      group:           parsed.group,
      version:         parsed.version,
      lastVersion:     parsed.lastVersion,
      cardId:          parsed.cardId,
      setId:           parsed.setId,
      ruleId:          parsed.ruleId,
      relatedCardsStr: parsed.relatedCards.join(', '),
      delta:           parsed.delta as ItemDelta | null,
      glow:            parsed.glow as GlowEntry[] | null,
    };
  });
}

/** Applies live text-mode parse results to the form, clearing previews of changed items. */
function handleTextParsed(result: ParsedResult) {
  textErrors.value = result.errors;
  textPendingCount.value = result.searches.length;
  const next = mapParsedToForm(result.items);
  const nextByKey = new Map(next.map(item => [item._key, item]));
  for (const old of form.items) {
    const kept = nextByKey.get(old._key);
    if (!kept || !sameItem(old, kept)) clearItemPreviewState(old._key);
  }
  form.items = next;
}

/** Switches between form and text editing modes, serializing items on enter. */
function toggleTextMode() {
  if (!isTextMode.value) {
    yamlText.value = serializeItems(form.items.map(toTextItem));
    isTextMode.value = true;
    return;
  }
  if (textErrors.value.length > 0 || textPendingCount.value > 0) {
    const detail = textPendingCount.value > 0
      ? `${textPendingCount.value} 个 cardId 搜索未完成`
      : '当前文本存在错误';
    if (!confirm(`退出文本模式将丢弃：${detail}，且条目列表回退到上次有效状态。确定退出？`)) return;
  }
  isTextMode.value = false;
  // Text-mode live sync clears previews of changed items; reload stored images
  // so the form shows them again.
  void loadExistingImages();
}

function openSortModal() {
  sortSnapshot.value = form.items.slice();
  for (const item of form.items) {
    if (item.cardId) void ensureCardMeta(item.cardId);
  }
  sortModalOpen.value = true;
}

function cancelSort() {
  form.items = sortSnapshot.value.slice();
  sortModalOpen.value = false;
}

// Distinct tile tint and type pill colors per change type.
const typeColors: Record<string, { pill: string, tile: string }> = {
  card_change:  { pill: 'bg-blue-100 text-blue-600', tile: 'bg-blue-50' },
  card_update:  { pill: 'bg-amber-100 text-amber-600', tile: 'bg-amber-50' },
  set_change:   { pill: 'bg-violet-100 text-violet-600', tile: 'bg-violet-50' },
  rule_change:  { pill: 'bg-rose-100 text-rose-600', tile: 'bg-rose-50' },
  format_birth: { pill: 'bg-emerald-100 text-emerald-600', tile: 'bg-emerald-50' },
  format_death: { pill: 'bg-slate-100 text-slate-500', tile: 'bg-slate-50' },
};
const defaultTypeColor = { pill: 'bg-slate-100 text-slate-500', tile: 'bg-white' };

/** Returns the pill and tile color classes for an item's change type. */
function typeColor(type: string) {
  return typeColors[type] ?? defaultTypeColor;
}

function tileTitle(item: ItemForm): string {
  const name = item.cardId ? cardMetas[item.cardId]?.name : null;
  if (name) return name;
  return item.cardId || item.setId || item.ruleId || item.type || '未命名条目';
}

function tileMeta(item: ItemForm): string {
  const parts = [item.status, item.format, item.group];
  return parts.filter(Boolean).join(' · ') || '暂无标识';
}

async function handleAiParse(index: number) {
  const link = form.link[index];
  if (!link?.url) return;
  link._parsing = true;
  try {
    const result: any = await client.hearthstone.announcement.aiParse({
      name:  form.name || undefined,
      links: [{ url: link.url, label: link.label }],
    });

    const header = result.header ?? {};
    if (!form.name && header.name) form.name = header.name;
    if (!form.date && header.date) form.date = header.date;
    if (!form.effectiveDate && header.effectiveDate) form.effectiveDate = header.effectiveDate;
    if (form.version == null && header.version != null) form.version = header.version;

    const items: ItemForm[] = (result.items ?? []).map((i: any) => ({
      _key:            crypto.randomUUID(), type:            i.type ?? 'card_update', format:          i.format ?? '',
      status:          i.status ?? '', group:           i.group ?? '',
      cardId:          i.cardId ?? '', setId:           i.setId ?? '', ruleId:          i.ruleId ?? '',
      effectiveDate:   '', version:         undefined, lastVersion:     undefined,
      relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
      delta:           i.delta ?? null, glow:            i.glow ?? null,
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
  } catch (e: any) {
    showToast('加载失败', e.message, 'error');
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  if (!form.name.trim()) {
    showToast('名称不能为空', '', 'error');
    return;
  }

  if (!form.date) {
    showToast('日期不能为空', '', 'error');
    return;
  }

  if (form.version == null) {
    showToast('版本不能为空', '', 'error');
    return;
  }
  saving.value = true;
  try {
    const payload = {
      source:        form.source, date:          form.date, effectiveDate: form.effectiveDate || null,
      version:       form.version, lastVersion:   form.lastVersion ?? null, name:          form.name.trim(),
      link:          form.link.filter(l => l.url),
      items:         form.items.map(item => {
        const kind = idKindOf(item.type);
        return {
          type:          item.type, effectiveDate: item.effectiveDate || null,
          format:        item.format || null, status:        item.status || null,
          group:         item.group || null, version:       item.version ?? null, lastVersion:   item.lastVersion ?? null,
          cardId:        kind === 'card' ? item.cardId || null : null,
          setId:         kind === 'set' ? item.setId || null : null,
          ruleId:        kind === 'rule' ? item.ruleId || null : null,
          relatedCards:  kind === 'card' ? parseRelatedCards(item.relatedCardsStr) : [],
          delta:         item.delta, glow:          item.glow,
        };
      }),
    };
    let nextId: string | null = form.id ?? null;
    if (isCreating.value) {
      const created = await client.hearthstone.announcement.create(payload);
      nextId = created.id;
    } else if (form.id) {
      await client.hearthstone.announcement.update({ id: form.id, ...payload });
    }
    showToast('保存成功', '', 'success');
    await loadAnnouncements();
    // Keep the saved announcement selected so the editor stays on it after saving.
    if (nextId) {
      selectedId.value = nextId;
      isCreating.value = false;
      await loadDetail(nextId);
    } else {
      resetForm();
    }
  } catch (e: any) {
    showToast('保存失败', e.message, 'error');
  } finally {
    saving.value = false;
  }
}

async function handleProject() {
  if (!form.id) return;
  projecting.value = true;
  try {
    await client.hearthstone.announcement.project({ announcementId: form.id });
    showToast('投影完成', '', 'success');
    await loadDetail(form.id);
  } catch (e: any) {
    showToast('投影失败', e.message, 'error');
  } finally {
    projecting.value = false;
  }
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
