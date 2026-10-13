<template>
  <div class="flex h-full gap-4 overflow-hidden p-4">
    <div class="flex w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span class="text-sm font-medium text-slate-700">公告列表</span>
        <div class="flex items-center gap-1">
          <USelect v-model="selectedSource" :items="sourceFilterOptions" size="xs" class="w-28" />
          <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="createNew" />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <div
          v-for="item in filteredAnnouncements"
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
              <span>·</span>
              <span>{{ item.itemCount ?? 0 }} 条</span>
            </div>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            class="opacity-0 group-hover:opacity-100 transition-opacity"
            @click.stop="confirmDelete(item)"
          />
        </div>
        <p v-if="filteredAnnouncements.length === 0 && !loading" class="py-8 text-center text-sm text-slate-400">
          暂无公告
        </p>
        <div v-if="loading" class="flex justify-center py-8">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-slate-400" />
        </div>
      </div>
    </div>

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
              v-if="form.id"
              icon="i-lucide-wand"
              label="投影"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="projecting"
              @click="handleProject"
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
          <div class="grid grid-cols-4 gap-4">
            <UFormField label="来源" required>
              <USelect v-model="form.source" :items="sourceOptions" placeholder="选择来源" class="w-full" />
            </UFormField>
            <UFormField label="日期" required>
              <UInput v-model="form.date" type="date" />
            </UFormField>
            <UFormField label="生效日期">
              <UInput v-model="form.effectiveDate" type="date" />
            </UFormField>
            <UFormField v-if="config.fields.prevVersion" label="对比版本">
              <UInput v-model="form.prevVersion" type="date" />
            </UFormField>
          </div>
          <div v-if="config.fields.platformDates" class="mt-4 grid grid-cols-4 gap-4">
            <UFormField label="实体生效日期">
              <UInput v-model="form.effectiveDateTabletop" type="date" />
            </UFormField>
            <UFormField label="线上生效日期">
              <UInput v-model="form.effectiveDateOnline" type="date" />
            </UFormField>
            <UFormField label="Arena 生效日期">
              <UInput v-model="form.effectiveDateArena" type="date" />
            </UFormField>
            <UFormField label="下次检查日期">
              <UInput v-model="form.nextDate" type="date" />
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
          <UFormField label="名称" required class="mt-4">
            <UInput v-model="form.name" placeholder="输入公告名称" />
          </UFormField>
          <UFormField label="链接" class="mt-4">
            <div class="space-y-2">
              <div v-for="(link, index) in form.link" :key="index" class="flex gap-2">
                <UInput v-model="link.url" placeholder="URL" class="flex-1" />
                <UInput v-model="link.label" placeholder="标签 (可选)" class="w-32" />
                <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" @click="removeLink(index)" />
              </div>
              <UButton icon="i-lucide-plus" label="添加链接" variant="ghost" size="sm" @click="addLink" />
            </div>
          </UFormField>

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
                  <UFormField v-if="config.fields.prevVersion" label="对比版本 (覆盖)">
                    <UInput v-model="item.prevVersion" type="date" />
                  </UFormField>
                </div>
                <div class="mt-3 grid grid-cols-4 gap-3">
                  <UFormField label="卡牌ID">
                    <UInput v-model="item.cardId" placeholder="card id" />
                  </UFormField>
                  <UFormField label="系列ID">
                    <UInput v-model="item.setId" placeholder="set id" />
                  </UFormField>
                  <UFormField label="规则ID">
                    <UInput v-model="item.ruleId" placeholder="rule id" />
                  </UFormField>
                  <UFormField label="分组">
                    <UInput v-model="item.group" placeholder="分组键" />
                  </UFormField>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <UFormField label="relatedCards (逗号分隔)">
                    <UInput v-model="item.relatedCards" placeholder="card1, card2" />
                  </UFormField>
                  <UFormField label="分数">
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
import { computed, onMounted, reactive, ref } from 'vue';
import { useToast } from '@nuxt/ui/composables';

import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';
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

const props = defineProps<{
  /** The desktop runtime orpc namespace of the game, e.g. 'magic'. */
  game: string;
  sources: { label: string, value: string }[];
  typeLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  config: AnnouncementFormConfig;
  /** Whether the apply button (full replay) is offered. */
  apply?: boolean;
}>();

const client = useDesktopRuntimeClient() as any;
const toast = useToast();

const announcements = ref<any[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const isCreating = ref(false);
const saving = ref(false);
const projecting = ref(false);
const applying = ref(false);
const deleting = ref(false);
const deleteModalOpen = ref(false);
const deleteTarget = ref<any>(null);
const selectedSource = ref('all');
const isYamlMode = ref(false);
const yamlText = ref('');
const yamlErrors = ref<string[]>([]);

let itemKeySeq = 0;
const nextItemKey = () => `item-${++itemKeySeq}`;

const emptyForm = (): AnnouncementFormData => ({
  source:                props.sources[0]?.value ?? '',
  date:                  new Date().toISOString().split('T')[0]!,
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

const form = reactive<AnnouncementFormData>(emptyForm());
let formId = '';

const sourceOptions = props.sources;
const sourceFilterOptions = [{ label: '全部来源', value: 'all' }, ...props.sources];
const filteredAnnouncements = computed(() =>
  selectedSource.value === 'all' ? announcements.value : announcements.value.filter(a => a.source === selectedSource.value),
);
const typeOptions = computed(() => props.config.types.map(t => ({ label: props.typeLabels[t] ?? t, value: t })));
const applyEnabled = computed(() => props.apply ?? false);

const statusOptionsFor = (type: string) =>
  statusOptionsOfType(type, props.config).map(s => ({ label: props.statusLabels[s] ?? s, value: s }));

const typeLabelOf = (type: string) => props.typeLabels[type] ?? type;

function notify(title: string, description?: string, color: 'error' | 'success' | 'warning' = 'success') {
  toast.add({ title, description, color });
}

async function loadAnnouncements() {
  loading.value = true;
  try {
    announcements.value = await client[props.game].announcement.list();
  } catch (error) {
    notify('加载失败', errorMessage(error), 'error');
  } finally {
    loading.value = false;
  }
}

async function loadDetail(id: string) {
  try {
    const detail = await client[props.game].announcement.get({ id });
    fillForm(detail);
  } catch (error) {
    notify('加载详情失败', errorMessage(error), 'error');
  }
}

function fillForm(row: any) {
  formId = row.id;
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
  selectedId.value = item.id;
  void loadDetail(item.id);
}

function createNew() {
  resetForm();
  isCreating.value = true;
}

function resetForm() {
  Object.assign(form, emptyForm());
  form.link = [];
  form.items = [];
  formId = '';
  selectedId.value = null;
  isCreating.value = false;
  isYamlMode.value = false;
  yamlErrors.value = [];
}

function addLink() {
  form.link.push({ url: '', label: '' });
}

function removeLink(index: number) {
  form.link.splice(index, 1);
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
    items:                 form.items.map(item => ({
      type:          item.type,
      effectiveDate: item.effectiveDate || null,
      format:        item.format || null,
      status:        normalizeItemStatus(item.type, item.status, props.config) || null,
      score:         item.score ?? null,
      group:         item.group || null,
      prevVersion:   fields.prevVersion ? (item.prevVersion || null) : undefined,
      version:       fields.versionFields ? item.version : undefined,
      lastVersion:   fields.versionFields ? (item.lastVersion ?? null) : undefined,
      cardId:        item.cardId || null,
      setId:         item.setId || null,
      ruleId:        item.ruleId || null,
      relatedCards:  parseRelatedCards(item.relatedCards),
      delta:         fields.deltaGlow ? jsonOrNull(item.delta) : undefined,
      glow:          fields.deltaGlow ? jsonOrNull(item.glow) : undefined,
    })),
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
      await client[props.game].announcement.create(payload);
      notify('创建成功');
    } else if (formId) {
      await client[props.game].announcement.update({ id: formId, ...payload });
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

async function handleProject() {
  if (!formId) {
    return;
  }
  projecting.value = true;
  try {
    await client[props.game].announcement.project({ announcementId: formId });
    notify('投影完成');
    await loadDetail(formId);
  } catch (error) {
    notify('投影失败', errorMessage(error), 'error');
  } finally {
    projecting.value = false;
  }
}

async function handleApply() {
  applying.value = true;
  try {
    const result = await client[props.game].announcement.apply({ dryRun: false });
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
    await client[props.game].announcement.remove({ id: deleteTarget.value.id });
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

onMounted(() => {
  void loadAnnouncements();
});
</script>
