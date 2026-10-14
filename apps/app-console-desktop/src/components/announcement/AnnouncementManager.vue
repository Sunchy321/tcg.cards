<template>
  <!-- 100vh minus the admin header (h-14) and main's p-6: the exact one-page height; this page's p-4 lives inside it. -->
  <div class="flex max-h-[calc(100vh-6.5rem)] gap-4 overflow-hidden p-4">
    <AnnouncementListPanel
      :announcements="announcements"
      :loading="loading"
      :selected-id="selectedId"
      :sources="sources"
      @select="selectAnnouncement"
      @create="createNew"
      @delete="confirmDelete"
    />

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <template v-if="selectedId || isCreating">
        <div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
          <span class="text-sm text-slate-500">编辑公告</span>
          <div class="flex items-center gap-2">
            <UButton
              :icon="isYamlMode ? 'i-lucide-form-input' : 'i-lucide-file-code'"
              :label="isYamlMode ? '表单模式' : 'YAML 模式'"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="toggleYamlMode"
            />
            <UButton
              v-if="applyEnabled"
              icon="i-lucide-play"
              label="应用"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="applying"
              @click="handleApply"
            />
            <UButton label="取消" color="neutral" variant="ghost" size="sm" @click="resetForm" />
            <UButton label="保存" size="sm" :loading="saving" @click="handleSubmit" />
          </div>
        </div>
        <div v-if="isYamlMode" class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-5">
          <YamlEditor v-model="yamlText" height="100%" />
          <ul v-if="yamlErrors.length > 0" class="space-y-1 text-xs text-error">
            <li v-for="(message, index) in yamlErrors" :key="index">{{ message }}</li>
          </ul>
        </div>
        <div v-else class="flex-1 overflow-y-auto p-5">
          <AnnouncementFields :sources="sourceOptions" @url-change="(link, value) => { link.url = value }">
            <template v-if="aiParse" #link-actions="{ link }">
              <UButton icon="i-lucide-sparkles" aria-label="解析公告" size="sm" color="primary" variant="ghost" :disabled="!aiConfigured || !link.url" @click="startParse(link)" />
            </template>
            <template v-if="aiParse" #link-below="{ link }">
              <MagicAnnouncementAiParsePanel
                v-if="activeLink === link"
                :key="parseKey"
                :request-key="parseKey"
                :name="form.name"
                :url="link.url"
                @result="(result, key) => applyParseResult(link, result, key)"
                @close="activeLink = null"
              />
            </template>
          </AnnouncementFields>
          <div v-if="config.fields.platformDates || config.fields.prevVersion" class="mt-4 grid grid-cols-5 gap-4">
            <UFormField v-if="config.fields.platformDates" label="实体生效日期">
              <UInput v-model="form.effectiveDateTabletop" type="date" class="w-full" />
            </UFormField>
            <UFormField v-if="config.fields.platformDates" label="线上生效日期">
              <UInput v-model="form.effectiveDateOnline" type="date" class="w-full" />
            </UFormField>
            <UFormField v-if="config.fields.platformDates" label="Arena 生效日期">
              <UInput v-model="form.effectiveDateArena" type="date" class="w-full" />
            </UFormField>
            <UFormField v-if="config.fields.platformDates" label="下次检查日期">
              <UInput v-model="form.nextDate" type="date" class="w-full" />
            </UFormField>
            <UFormField v-if="config.fields.prevVersion" label="对比版本">
              <UInput v-model="form.prevVersion" type="date" class="w-full" />
            </UFormField>
          </div>
          <div v-if="config.fields.versionFields" class="mt-4 grid grid-cols-4 gap-4">
            <UFormField label="版本" required>
              <UInputNumber v-model="form.version" :min="1" />
            </UFormField>
            <UFormField label="对比版本" required>
              <UInputNumber v-model="form.lastVersion" :min="1" />
            </UFormField>
          </div>

          <div class="mt-4 border-t border-slate-200 pt-4">
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm font-medium text-slate-700">公告条目</span>
              <UButton icon="i-lucide-plus" label="添加条目" size="xs" @click="addItem" />
            </div>
            <div class="space-y-3">
              <div v-for="(item, index) in form.items" :key="item._key" class="relative rounded-lg border border-slate-200 p-3">
                <div class="absolute right-2 top-2 flex items-center gap-0.5">
                  <UButton icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="xs" :disabled="index === 0" @click="moveItem(index, -1)" />
                  <UButton icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="xs" :disabled="index === form.items.length - 1" @click="moveItem(index, 1)" />
                  <UButton icon="i-lucide-x" color="error" variant="ghost" size="xs" @click="removeItem(index)" />
                </div>
                <div class="grid grid-cols-4 gap-3 pr-6">
                  <UFormField label="类型" required>
                    <USelect
                      :model-value="item.type"
                      :items="typeOptions"
                      placeholder="选择类型"
                      class="w-full"
                      @update:model-value="(value: string) => onItemTypeChange(item, value)"
                    />
                  </UFormField>
                  <UFormField label="状态">
                    <USelect
                      :model-value="item.status"
                      :items="statusOptionsFor(item.type)"
                      placeholder="选择状态"
                      class="w-full"
                      @update:model-value="(value: string) => { item.status = value }"
                    />
                  </UFormField>
                  <UFormField label="赛制 (keyword)">
                    <UInput v-model="item.format" placeholder="format keyword" />
                  </UFormField>
                  <UFormField v-if="config.fields.prevVersion && item.type === 'card_update'" label="对比版本 (覆盖)">
                    <UInput v-model="item.prevVersion" type="date" class="w-full" />
                  </UFormField>
                </div>
                <!-- Entity references are mutually exclusive by type: card types carry
                     cardId (+ relatedCards), set_change carries setId, rule_change
                     carries ruleId, and the format lifecycle types carry none. -->
                <div v-if="entityKindOf(item.type) !== 'none'" class="mt-3 grid grid-cols-4 gap-3">
                  <UFormField v-if="entityKindOf(item.type) === 'card'" label="卡牌ID">
                    <CardSearchSelect
                      v-if="cardSearch"
                      v-model="item.cardId"
                      :search="cardSearch"
                      :resolve="cardResolve"
                      placeholder="搜索卡牌名称或直接输入 cardId"
                    />
                    <UInput v-else v-model="item.cardId" placeholder="card id 或 #分组哨兵" />
                  </UFormField>
                  <UFormField v-if="entityKindOf(item.type) === 'card'" label="分组">
                    <UInput v-model="item.group" placeholder="分组键" />
                  </UFormField>
                  <UFormField v-if="entityKindOf(item.type) === 'set'" label="系列ID">
                    <UInput v-model="item.setId" placeholder="set id" />
                  </UFormField>
                  <UFormField v-if="entityKindOf(item.type) === 'rule'" label="规则ID">
                    <UInput v-model="item.ruleId" placeholder="rule id" />
                  </UFormField>
                  <UFormField v-if="item.status === 'score'" label="分数">
                    <UInputNumber v-model="item.score" :min="1" placeholder="分数" />
                  </UFormField>
                </div>
                <div v-if="config.fields.versionFields" class="mt-3 grid grid-cols-2 gap-3">
                  <UFormField label="版本 (覆盖)">
                    <UInputNumber v-model="item.version" :min="1" placeholder="继承公告版本" />
                  </UFormField>
                  <UFormField label="对比版本 (覆盖)">
                    <UInputNumber v-model="item.lastVersion" :min="1" placeholder="继承公告对比版本" />
                  </UFormField>
                </div>
                <details v-if="config.fields.deltaGlow" class="mt-3">
                  <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Delta / Glow (高级)</summary>
                  <div class="mt-2 grid grid-cols-2 gap-3">
                    <UFormField label="Delta (JSON)">
                      <UTextarea v-model="item.delta" placeholder='{ "attack": 4, "cost": 3 }' :rows="3" class="font-mono text-xs" />
                    </UFormField>
                    <UFormField label="Glow (JSON)">
                      <UTextarea v-model="item.glow" placeholder='[{ "part": "attack", "type": "buff" }]' :rows="3" class="font-mono text-xs" />
                    </UFormField>
                  </div>
                </details>
              </div>
              <p v-if="form.items.length === 0" class="py-6 text-center text-sm text-slate-400">
                暂无条目，点击"添加条目"创建
              </p>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
        <UIcon name="i-lucide-file-text" class="size-10 opacity-50" />
        <p class="text-sm">选择左侧公告进行编辑，或创建新公告</p>
        <UButton icon="i-lucide-plus" label="创建新公告" @click="createNew" />
      </div>
    </div>

    <UModal v-model:open="deleteModalOpen" title="确认删除" class="sm:max-w-sm">
      <template #body>
        <p class="text-sm text-slate-600">确定要删除公告"{{ deleteTarget?.name }}"吗？此操作不可撤销。</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="deleteModalOpen = false" />
          <UButton label="删除" color="error" :loading="deleting" @click="handleDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useToast } from '@nuxt/ui/composables';
import type { AiAnnouncementResult } from '@tcg-cards/model/magic/schema/announcement-ai';

import { useAnnouncementCrud } from '~/composables/useAnnouncementCrud';
import { provideAnnouncementForm, type AnnouncementFormLinkEntry } from '~/composables/useAnnouncementForm';
import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';
import { applyMagicAiResult } from '~/utils/magic-announcement-ai';
import MagicAnnouncementAiParsePanel from '../magic/AnnouncementAiParsePanel.vue';
import YamlEditor from '../YamlEditor.vue';
import {
  announcementToYaml,
  defaultItemType,
  newFormItem,
  normalizeItemStatus,
  parseRelatedCards,
  statusOptionsOfType,
  yamlToAnnouncement,
  type AnnouncementFormData,
  type AnnouncementFormConfig,
} from '~/utils/announcement-form-yaml';

type ItemRow = AnnouncementFormData['items'][number] & { _key: string };
interface ManagerForm extends AnnouncementFormData {
  items: ItemRow[];
}

/** One card matched by the game's card search RPC. */
interface ManagerCardSearchResult {
  cardId: string;
  nameEn: string | null;
  nameZh: string | null;
  set:    string | null;
  type:   string | null;
}

/** One card resolved by exact cardId by the game's card search RPC. */
interface ManagerResolvedCardName {
  cardId: string;
  nameEn: string | null;
  nameZh: string | null;
}

const props = defineProps<{
  /** The desktop runtime orpc namespace of the game, e.g. 'magic'. */
  game:         string;
  sources:      { label: string, value: string }[];
  typeLabels:   Record<string, string>;
  statusLabels: Record<string, string>;
  config:       AnnouncementFormConfig;
  /** Whether the apply button (full replay) is offered. */
  apply?:       boolean;
  /** Offers Magic's link parser using the configured AI model. */
  aiParse?:     boolean;
  /** Searches cards by localized name or cardId; when absent the card id renders as a plain input. */
  cardSearch?:  (query: string, format: string) => Promise<ManagerCardSearchResult[]>;
  /** Resolves existing cardIds to localized names for display. */
  cardResolve?: (cardIds: string[]) => Promise<ManagerResolvedCardName[]>;
}>();

const crud = useAnnouncementCrud(props.game);
const toast = useToast();

const announcements = ref<any[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const isCreating = ref(false);
const saving = ref(false);
const applying = ref(false);
const deleting = ref(false);
const deleteModalOpen = ref(false);
const deleteTarget = ref<any>(null);
const isYamlMode = ref(false);
const yamlText = ref('');
const yamlErrors = ref<string[]>([]);
const aiConfigured = ref(false);
const activeLink = ref<AnnouncementFormLinkEntry | null>(null);
const parseKey = ref(0);
let parseUrl = '';

let itemKeySeq = 0;
const nextItemKey = () => `item-${++itemKeySeq}`;

const emptyForm = (): AnnouncementFormData => ({
  source:                props.sources[0]?.value ?? '',
  // Leave AI-assisted announcements undated until the source or the user supplies a date.
  date:                  props.aiParse ? '' : new Date().toISOString().split('T')[0]!,
  effectiveDate:         '',
  effectiveDateTabletop: '',
  effectiveDateOnline:   '',
  effectiveDateArena:    '',
  nextDate:              '',
  prevVersion:           '',
  version:               null,
  lastVersion:           null,
  name:                  '',
  link:                  [],
  items:                 [],
});

const form = reactive<ManagerForm>({ ...emptyForm(), items: [] });
const formId = ref('');

provideAnnouncementForm(form);

const sourceOptions = props.sources;
const typeOptions = computed(() => props.config.types.map(t => ({ label: props.typeLabels[t] ?? t, value: t })));
const applyEnabled = computed(() => props.apply ?? false);

const statusOptionsFor = (type: string) =>
  statusOptionsOfType(type, props.config).map(s => ({ label: props.statusLabels[s] ?? s, value: s }));

/** Which entity reference an item type carries: card types use cardId, set_change uses setId, rule_change uses ruleId, the format lifecycle types use none. */
function entityKindOf(type: string): 'card' | 'set' | 'rule' | 'none' {
  if (type === 'set_change') {
    return 'set';
  }
  if (type === 'rule_change') {
    return 'rule';
  }
  if (type === 'card_change' || type === 'card_update' || type === 'card_split' || type === 'card_merge') {
    return 'card';
  }
  return 'none';
}

function notify(title: string, description?: string, color: 'error' | 'success' | 'warning' = 'success') {
  toast.add({ title, description, color });
}

async function loadAnnouncements() {
  loading.value = true;
  try {
    announcements.value = await crud.list();
  } finally {
    loading.value = false;
  }
}

async function loadDetail(id: string) {
  const detail = await crud.get(id);
  if (detail == null) {
    return;
  }
  fillForm(detail);
}

function fillForm(row: any) {
  activeLink.value = null;
  formId.value = row.id;
  form.source = row.source;
  form.date = row.date;
  form.effectiveDate = row.effectiveDate ?? '';
  form.effectiveDateTabletop = row.effectiveDateTabletop ?? '';
  form.effectiveDateOnline = row.effectiveDateOnline ?? '';
  form.effectiveDateArena = row.effectiveDateArena ?? '';
  form.nextDate = row.nextDate ?? '';
  form.prevVersion = row.prevVersion ?? '';
  form.version = row.version ?? null;
  form.lastVersion = row.lastVersion ?? null;
  form.name = row.name;
  form.link = Array.isArray(row.link) ? row.link.map((l: any) => ({ url: String(l?.url ?? ''), label: String(l?.label ?? '') })) : [];
  form.items = (row.items ?? []).map((i: any): ItemRow => ({
    _key:          nextItemKey(),
    type:          String(i.type ?? ''),
    status:        normalizeItemStatus(String(i.type ?? ''), i.status == null ? '' : String(i.status), props.config),
    effectiveDate: i.effectiveDate ?? '',
    format:        i.format ?? '',
    group:         i.group ?? '',
    prevVersion:   i.prevVersion ?? '',
    version:       i.version ?? null,
    lastVersion:   i.lastVersion ?? null,
    cardId:        i.cardId ?? '',
    setId:         i.setId ?? '',
    ruleId:        i.ruleId ?? '',
    relatedCards:  Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
    score:         i.score ?? null,
    delta:         i.delta != null ? JSON.stringify(i.delta, null, 2) : '',
    glow:          i.glow != null ? JSON.stringify(i.glow, null, 2) : '',
  }));
  isCreating.value = false;
  isYamlMode.value = false;
  yamlErrors.value = [];
}

function selectAnnouncement(item: any) {
  activeLink.value = null;
  selectedId.value = item.id;
  void loadDetail(item.id);
}

function createNew() {
  resetForm();
  isCreating.value = true;
}

function resetForm() {
  activeLink.value = null;
  Object.assign(form, emptyForm());
  form.link = [];
  form.items = [];
  formId.value = '';
  selectedId.value = null;
  isCreating.value = false;
  isYamlMode.value = false;
  yamlErrors.value = [];
}

function addItem() {
  const item = newFormItem(defaultItemType(props.config), props.config) as ItemRow;
  item._key = nextItemKey();
  form.items.push(item);
}

function removeItem(index: number) {
  form.items.splice(index, 1);
}

function moveItem(from: number, direction: -1 | 1) {
  const to = from + direction;
  if (to < 0 || to >= form.items.length) {
    return;
  }
  const item = form.items.splice(from, 1)[0]!;
  form.items.splice(to, 0, item);
}

function onItemTypeChange(item: ItemRow, type: string) {
  item.type = type;
  item.status = normalizeItemStatus(type, '', props.config);
}

function toggleYamlMode() {
  activeLink.value = null;
  if (!isYamlMode.value) {
    yamlText.value = announcementToYaml(form, props.config);
    yamlErrors.value = [];
    isYamlMode.value = true;
    return;
  }
  const parsed = yamlToAnnouncement(yamlText.value, props.config);
  if (!parsed.ok) {
    yamlErrors.value = parsed.errors;
    return;
  }
  const keepKeys = form.items.map(i => (i as ItemRow)._key);
  Object.assign(form, parsed.form);
  form.items = parsed.form.items.map((item, i) => ({ ...item, _key: keepKeys[i] ?? nextItemKey() })) as ItemRow[];
  isYamlMode.value = false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonOrNull(value: string): unknown {
  if (!value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toPayload() {
  const { fields } = props.config;
  return {
    source:                form.source,
    date:                  form.date,
    name:                  form.name.trim(),
    effectiveDate:         form.effectiveDate || null,
    effectiveDateTabletop: fields.platformDates ? (form.effectiveDateTabletop || null) : undefined,
    effectiveDateOnline:   fields.platformDates ? (form.effectiveDateOnline || null) : undefined,
    effectiveDateArena:    fields.platformDates ? (form.effectiveDateArena || null) : undefined,
    nextDate:              fields.platformDates ? (form.nextDate || null) : undefined,
    prevVersion:           fields.prevVersion ? (form.prevVersion || null) : undefined,
    version:               fields.versionFields ? form.version : undefined,
    lastVersion:           fields.versionFields ? (form.lastVersion ?? null) : undefined,
    link:                  form.link.filter(l => l.url),
    items:                 form.items.map(item => {
      const kind = entityKindOf(item.type);
      return {
        type:          item.type,
        effectiveDate: item.effectiveDate || null,
        format:        item.format || null,
        status:        normalizeItemStatus(item.type, item.status, props.config) || null,
        score:         item.status === 'score' ? (item.score ?? null) : null,
        group:         kind === 'card' ? (item.group || null) : null,
        prevVersion:   fields.prevVersion && item.type === 'card_update' ? (item.prevVersion || null) : undefined,
        version:       fields.versionFields ? item.version : undefined,
        lastVersion:   fields.versionFields ? (item.lastVersion ?? null) : undefined,
        cardId:        kind === 'card' ? (item.cardId || null) : null,
        setId:         kind === 'set' ? (item.setId || null) : null,
        ruleId:        kind === 'rule' ? (item.ruleId || null) : null,
        relatedCards:  kind === 'card' ? parseRelatedCards(item.relatedCards) : [],
        delta:         fields.deltaGlow ? jsonOrNull(item.delta) : undefined,
        glow:          fields.deltaGlow ? jsonOrNull(item.glow) : undefined,
      };
    }),
  };
}

async function handleSubmit() {
  if (isYamlMode.value) {
    const parsed = yamlToAnnouncement(yamlText.value, props.config);
    if (!parsed.ok) {
      yamlErrors.value = parsed.errors;
      return;
    }
    Object.assign(form, parsed.form);
  }
  if (!form.name.trim()) {
    notify('名称不能为空', undefined, 'error');
    return;
  }

  saving.value = true;
  try {
    const payload = toPayload();
    if (isCreating.value) {
      await crud.create(payload);
      notify('创建成功');
    } else if (formId.value) {
      await crud.update(formId.value, payload);
      notify('保存成功');
    }
    await loadAnnouncements();
    resetForm();
  } catch (error) {
    notify('保存失败', errorMessage(error), 'error');
  } finally {
    saving.value = false;
  }
}

async function handleApply() {
  applying.value = true;
  try {
    const result = await crud.apply(false);
    if (result.warnings.length > 0) {
      notify('应用完成(有警告)', result.warnings.slice(0, 3).join(';'), 'warning');
    } else {
      notify('应用完成', `已重建 ${result.formatCount} 个赛制的状态`);
    }
  } catch (error) {
    notify('应用失败', errorMessage(error), 'error');
  } finally {
    applying.value = false;
  }
}

function confirmDelete(item: any) {
  deleteTarget.value = item;
  deleteModalOpen.value = true;
}

async function handleDelete() {
  if (!deleteTarget.value) {
    return;
  }
  deleting.value = true;
  try {
    await crud.remove(deleteTarget.value.id);
    notify('删除成功');
    deleteModalOpen.value = false;
    if (selectedId.value === deleteTarget.value.id) {
      resetForm();
    }
    await loadAnnouncements();
  } catch (error) {
    notify('删除失败', errorMessage(error), 'error');
  } finally {
    deleting.value = false;
  }
}

/** Starts a fresh parser instance for the selected link. */
function startParse(link: AnnouncementFormLinkEntry): void {
  if (!aiConfigured.value || !link.url) return;
  activeLink.value = link;
  parseUrl = link.url;
  parseKey.value++;
}

/** Fills the active form only while the request still belongs to its original link. */
function applyParseResult(link: AnnouncementFormLinkEntry, result: AiAnnouncementResult, requestKey: number): void {
  if (requestKey !== parseKey.value || activeLink.value !== link || !form.link.some(entry => entry === link) || link.url !== parseUrl) return;
  applyMagicAiResult(form, result, props.config);
  for (const item of form.items) {
    if (!item._key) item._key = nextItemKey();
  }
  notify('解析完成', `新增 ${result.items.length} 条条目`);
}

// Removing or editing the source link invalidates the mounted parser immediately.
watch(() => form.link.map(link => link.url), () => {
  if (activeLink.value && (!form.link.some(link => link === activeLink.value) || activeLink.value.url !== parseUrl)) activeLink.value = null;
}, { flush: 'sync' });

onMounted(async () => {
  void loadAnnouncements();
  if (props.aiParse) {
    try {
      const health = await useDesktopRuntimeClient().runtime.health();
      aiConfigured.value = Boolean(health.aiConfigured);
    } catch {
      aiConfigured.value = false;
    }
  }
});
</script>
