<template>
  <div class="flex h-full gap-4 overflow-hidden p-4">
    <div class="flex w-64 shrink-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span class="text-sm font-medium text-slate-700">公告列表</span>
        <div class="flex items-center gap-1">
          <USelect v-model="selectedSource" :items="filterSourceOptions" size="xs" class="w-28" />
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
      <template v-if="selectedAnnouncement || isCreating">
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
            <UButton label="取消" color="neutral" variant="ghost" size="sm" @click="resetForm" />
            <UButton label="保存" size="sm" :loading="saving" @click="handleSubmit" />
          </div>
        </div>
        <YamlEditor v-if="isYamlMode" v-model="yamlContent" :error="yamlError" />
        <div v-else class="flex-1 overflow-y-auto p-5 space-y-4">
          <!-- Announcement fields -->
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
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="版本" required>
              <UInputNumber v-model="form.version" :min="1" />
            </UFormField>
            <UFormField label="对比版本" required>
              <UInputNumber v-model="form.lastVersion" :min="1" />
            </UFormField>
          </div>
          <UFormField label="名称" required>
            <UInput v-model="form.name" placeholder="输入公告名称" />
          </UFormField>
          <UFormField label="链接">
            <div class="space-y-2">
              <div v-for="(link, index) in form.link" :key="index" class="flex gap-2">
                <UInput v-model="link.url" placeholder="URL" class="flex-1" />
                <UInput v-model="link.label" placeholder="标签 (可选)" class="w-32" />
                <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" @click="removeLink(index)" />
              </div>
              <UButton icon="i-lucide-plus" label="添加链接" variant="ghost" size="sm" @click="addLink" />
            </div>
          </UFormField>

          <!-- Items -->
          <div class="border-t border-slate-200 pt-4">
            <div class="mb-3 flex items-center justify-between">
              <span class="text-sm font-medium text-slate-700">公告条目</span>
              <UButton icon="i-lucide-plus" label="添加条目" size="xs" @click="addItem" />
            </div>
            <div class="space-y-3">
              <div v-for="(item, index) in form.items" :key="index" class="relative rounded-lg border border-slate-200 p-3">
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="xs"
                  class="absolute right-2 top-2"
                  @click="removeItem(index)"
                />
                <div class="grid grid-cols-4 gap-3 pr-6">
                  <UFormField label="类型" required>
                    <USelect v-model="item.type" :items="itemTypeOptions" placeholder="选择类型" class="w-full" />
                  </UFormField>
                  <UFormField label="状态">
                    <USelect v-model="item.status" :items="statusOptions" placeholder="选择状态" class="w-full" />
                  </UFormField>
                  <UFormField label="赛制 (keyword)">
                    <UInput v-model="item.format" placeholder="standard / constructed" />
                  </UFormField>
                  <UFormField label="名称">
                    <UInput v-model="item.name" placeholder="变更描述" />
                  </UFormField>
                </div>
                <div class="mt-3 grid grid-cols-4 gap-3">
                  <UFormField label="卡牌ID">
                    <UInput v-model="item.cardId" placeholder="ABC_123" />
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
                    <UInput v-model="item.relatedCardsStr" placeholder="card1, card2" />
                  </UFormField>
                  <UFormField label="分数">
                    <UInputNumber v-model="item.score" :min="1" placeholder="分数" />
                  </UFormField>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <UFormField label="版本 (覆盖)">
                    <UInputNumber v-model="item.version" :min="1" placeholder="继承公告版本" />
                  </UFormField>
                  <UFormField label="对比版本 (覆盖)">
                    <UInputNumber v-model="item.lastVersion" :min="1" placeholder="继承公告对比版本" />
                  </UFormField>
                </div>
                <!-- Delta + Glow -->
                <details class="mt-3">
                  <summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-700">Delta / Glow (高级)</summary>
                  <div class="mt-2 grid grid-cols-2 gap-3">
                    <UFormField label="Delta (JSON)">
                      <UTextarea v-model="item.deltaStr" placeholder='{ "attack": 4, "cost": 3 }' :rows="3" class="font-mono text-xs" />
                    </UFormField>
                    <UFormField label="Glow (JSON)">
                      <UTextarea v-model="item.glowStr" placeholder='[{ "part": "attack", "type": "buff" }]' :rows="3" class="font-mono text-xs" />
                    </UFormField>
                  </div>
                </details>
                <!-- Preview panel placeholder -->
                <div v-if="item.showPreview && (item.deltaStr || item.glowStr)" class="mt-3 rounded border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400">
                  预览面板 (待实现)
                </div>
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
        <p class="text-sm text-slate-600">确定要删除公告"{{ announcementToDelete?.name }}"吗？此操作不可撤销。</p>
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

definePageMeta({
  layout: 'admin',
  title:  '公告管理',
});
import { useConsolePlatform } from '@tcg-cards/console-platform';
import { computed, onMounted, reactive, ref } from 'vue';
import YAML from 'yaml';

import YamlEditor from '../../../components/YamlEditor.vue';
import type { AnnouncementProfile } from '@tcg-cards/model/src/hearthstone/schema/announcement';

interface LinkEntry { url: string; label?: string }
interface ItemForm {
  id?: string;
  type: string;
  name: string;
  effectiveDate: string;
  format: string;
  status: string;
  score?: number;
  group: string;
  version?: number;
  lastVersion?: number;
  patchId?: number;
  cardId: string;
  setId: string;
  ruleId: string;
  deltaStr: string;
  glowStr: string;
  relatedCardsStr: string;
  showPreview: boolean;
  formats: string[];
  cardIds: string[];
}

const platform = useConsolePlatform();
const orpc: any = platform.api.createClient();

const announcements = ref<AnnouncementProfile[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const isCreating = ref(false);
const saving = ref(false);
const projecting = ref(false);
const deleteModalOpen = ref(false);
const deleting = ref(false);
const announcementToDelete = ref<AnnouncementProfile>();
const isYamlMode = ref(false);
const yamlContent = ref('');
const yamlError = ref('');

const emptyItem = (): ItemForm => ({
  type: 'card_update',
  name: '',
  effectiveDate: '',
  format: '',
  status: '',
  score: undefined,
  group: '',
  version: undefined,
  lastVersion: undefined,
  patchId: undefined,
  cardId: '',
  setId: '',
  ruleId: '',
  deltaStr: '',
  glowStr: '',
  relatedCardsStr: '',
  showPreview: false,
  formats: [],
  cardIds: [],
});

const form = reactive({
  id: '',
  source: 'blizzard',
  date: new Date().toISOString().split('T')[0]!,
  effectiveDate: '',
  version: 1,
  lastVersion: undefined,
  name: '',
  link: [] as LinkEntry[],
  items: [] as ItemForm[],
});

const selectedAnnouncement = computed(() => announcements.value.find(a => a.id === selectedId.value) ?? null);

const sourceOptions = [
  { label: 'Blizzard', value: 'blizzard' },
  { label: '系列发售', value: 'release' },
];

const itemTypeOptions = [
  { label: 'card_change — 合法性变更', value: 'card_change' },
  { label: 'card_update — 数值/属性变更', value: 'card_update' },
  { label: 'set_change — 系列事件', value: 'set_change' },
  { label: 'rule_change — 规则变更', value: 'rule_change' },
  { label: 'format_birth — 赛制上线', value: 'format_birth' },
  { label: 'format_death — 赛制下架', value: 'format_death' },
];

const statusOptions = [
  // card_update
  { label: 'buff — 增强', value: 'buff' },
  { label: 'nerf — 削弱', value: 'nerf' },
  { label: 'tweak — 小更新', value: 'tweak' },
  { label: 'revert — 退环境回调', value: 'revert' },
  { label: 'rework — 重做', value: 'rework' },
  { label: 'text_fix — 文本修复', value: 'text_fix' },
  { label: 'text_adjust — 文本调整', value: 'text_adjust' },
  { label: 'bugged — 数据异常', value: 'bugged' },
  { label: 'bugfix — Bug 修复', value: 'bugfix' },
  // card_change / set_change / rule_change
  { label: 'banned — 完全禁用', value: 'banned' },
  { label: 'banned_in_card_pool — 卡池禁用', value: 'banned_in_card_pool' },
  { label: 'banned_in_deck — 卡组禁用', value: 'banned_in_deck' },
  { label: 'legal — 合法可用', value: 'legal' },
  { label: 'unavailable — 不可用', value: 'unavailable' },
  { label: 'minor — 不完全可用', value: 'minor' },
  { label: 'score — 计分', value: 'score' },
  // set_change
  { label: 'extend — 系列扩展', value: 'extend' },
];

const selectedSource = ref('all');
const filterSourceOptions = [{ label: '全部来源', value: 'all' }, ...sourceOptions];
const filteredAnnouncements = computed(() =>
  selectedSource.value === 'all' ? announcements.value : announcements.value.filter(a => a.source === selectedSource.value),
);

function showToast(input: { title: string; description?: string; color?: 'error' | 'success' }) {
  platform.toast.show(input);
}

function parseRelatedCards(s: string): string[] {
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

function toYaml() {
  return YAML.stringify({
    source: form.source,
    date: form.date,
    effectiveDate: form.effectiveDate || null,
    version: form.version,
    lastVersion: form.lastVersion,
    name: form.name,
    link: form.link,
    items: form.items.map(item => ({
      type: item.type,
      name: item.name || null,
      effectiveDate: item.effectiveDate || null,
      format: item.format || null,
      status: item.status || null,
      score: item.score ?? null,
      group: item.group || null,
      version: item.version ?? null,
      lastVersion: item.lastVersion ?? null,
      patchId: item.patchId ?? null,
      cardId: item.cardId || null,
      setId: item.setId || null,
      ruleId: item.ruleId || null,
      delta: parseJsonSafe(item.deltaStr),
      glow: parseJsonSafe(item.glowStr),
      relatedCards: parseRelatedCards(item.relatedCardsStr) || null,
      formats: item.formats,
      cardIds: item.cardIds,
    })),
  }, { indent: 2 });
}

function parseJsonSafe(s: string): unknown | null {
  if (!s.trim()) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function fromYaml(content: string): boolean {
  try {
    const data = YAML.parse(content);
    if (data.source !== undefined) form.source = data.source;
    if (data.date !== undefined) form.date = data.date;
    if (data.effectiveDate !== undefined) form.effectiveDate = data.effectiveDate ?? '';
    if (data.version !== undefined) form.version = data.version ?? 1;
    if (data.lastVersion !== undefined) form.lastVersion = data.lastVersion ?? undefined;
    if (data.name !== undefined) form.name = data.name;
    if (data.link !== undefined) form.link = Array.isArray(data.link) ? data.link : [];
    if (data.items !== undefined) {
      form.items = Array.isArray(data.items) ? data.items.map((i: any) => ({
        id: i.id,
        type: i.type ?? 'card_update',
        name: i.name ?? '',
        effectiveDate: i.effectiveDate ?? '',
        format: i.format ?? '',
        status: i.status ?? '',
        score: i.score ?? undefined,
        group: i.group ?? '',
        version: i.version,
        lastVersion: i.lastVersion,
        patchId: i.patchId,
        cardId: i.cardId ?? '',
        setId: i.setId ?? '',
        ruleId: i.ruleId ?? '',
        deltaStr: i.delta ? JSON.stringify(i.delta, null, 2) : '',
        glowStr: i.glow ? JSON.stringify(i.glow, null, 2) : '',
        relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
        showPreview: false,
        formats: i.formats ?? [],
        cardIds: i.cardIds ?? [],
      })) : [];
    }
    yamlError.value = '';
    return true;
  } catch (error) {
    yamlError.value = error instanceof Error ? error.message : 'YAML 解析失败';
    return false;
  }
}

function syncYaml() {
  yamlContent.value = toYaml();
  yamlError.value = '';
}

function toggleYamlMode() {
  if (!isYamlMode.value) {
    syncYaml();
    isYamlMode.value = true;
    return;
  }

  if (fromYaml(yamlContent.value)) {
    isYamlMode.value = false;
  }
}

function resetForm() {
  form.id = '';
  form.source = 'blizzard';
  form.date = new Date().toISOString().split('T')[0]!;
  form.effectiveDate = '';
  form.version = 1;
  form.lastVersion = undefined;
  form.name = '';
  form.link = [];
  form.items = [];
  selectedId.value = null;
  isCreating.value = false;
  isYamlMode.value = false;
  yamlError.value = '';
}

function fillForm(row: any) {
  form.id = row.id;
  form.source = row.source;
  form.date = row.date;
  form.effectiveDate = row.effectiveDate ?? '';
  form.version = row.version;
  form.lastVersion = row.lastVersion ?? undefined;
  form.name = row.name;
  form.link = Array.isArray(row.link) ? row.link : [];
  form.items = (row.items ?? []).map((i: any) => ({
    id: i.id,
    type: i.type ?? 'card_update',
    name: i.name ?? '',
    effectiveDate: i.effectiveDate ?? '',
    format: i.format ?? '',
    status: i.status ?? '',
    score: i.score ?? undefined,
    group: i.group ?? '',
    version: i.version,
    lastVersion: i.lastVersion,
    patchId: i.patchId,
    cardId: i.cardId ?? '',
    setId: i.setId ?? '',
    ruleId: i.ruleId ?? '',
    deltaStr: i.delta ? JSON.stringify(i.delta) : '',
    glowStr: i.glow ? JSON.stringify(i.glow) : '',
    relatedCardsStr: Array.isArray(i.relatedCards) ? i.relatedCards.join(', ') : '',
    showPreview: false,
    formats: i.formats ?? [],
    cardIds: i.cardIds ?? [],
  }));
  isCreating.value = false;
  isYamlMode.value = false;
  yamlError.value = '';
}

function selectAnnouncement(item: AnnouncementProfile) {
  selectedId.value = item.id;
  loadDetail(item.id);
}

async function loadDetail(id: string) {
  try {
    const detail = await orpc.hearthstone.announcement.get({ id });
    fillForm(detail);
  } catch (error) {
    showToast({ title: '加载详情失败', description: error instanceof Error ? error.message : String(error), color: 'error' });
  }
}

function createNew() {
  resetForm();
  isCreating.value = true;
}

function addLink() {
  form.link.push({ url: '', label: '' });
}

function removeLink(index: number) {
  form.link.splice(index, 1);
}

function addItem() {
  form.items.push(emptyItem());
}

function removeItem(index: number) {
  form.items.splice(index, 1);
}

function normalizePayload() {
  return {
    source: form.source,
    date: form.date,
    effectiveDate: form.effectiveDate || null,
    version: form.version,
    lastVersion: form.lastVersion,
    name: form.name.trim(),
    link: form.link.filter(l => l.url),
    items: form.items.map(item => ({
      type: item.type,
      name: item.name || null,
      effectiveDate: item.effectiveDate || null,
      format: item.format || null,
      status: item.status || null,
      score: item.score ?? null,
      group: item.group || null,
      version: item.version ?? null,
      lastVersion: item.lastVersion ?? null,
      patchId: item.patchId ?? null,
      cardId: item.cardId || null,
      setId: item.setId || null,
      ruleId: item.ruleId || null,
      delta: parseJsonSafe(item.deltaStr),
      glow: parseJsonSafe(item.glowStr),
      relatedCards: parseRelatedCards(item.relatedCardsStr),
      formats: item.formats,
      cardIds: item.cardIds,
    })),
  };
}

async function loadAnnouncements() {
  loading.value = true;
  try {
    announcements.value = await orpc.hearthstone.announcement.list();
    if (selectedId.value) {
      const current = announcements.value.find(item => item.id === selectedId.value);
      if (current) selectAnnouncement(current);
    }
  } catch (error) {
    showToast({ title: '加载失败', description: error instanceof Error ? error.message : String(error), color: 'error' });
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  if (isYamlMode.value && !fromYaml(yamlContent.value)) {
    return;
  }

  if (!form.name.trim()) {
    showToast({ title: '名称不能为空', color: 'error' });
    return;
  }

  saving.value = true;
  try {
    const payload = normalizePayload();
    if (isCreating.value) {
      await orpc.hearthstone.announcement.create(payload);
      showToast({ title: '创建成功', color: 'success' });
    } else if (form.id) {
      await orpc.hearthstone.announcement.update({ id: form.id, ...payload });
      showToast({ title: '保存成功', color: 'success' });
    }
    await loadAnnouncements();
    resetForm();
  } catch (error) {
    showToast({ title: '保存失败', description: error instanceof Error ? error.message : String(error), color: 'error' });
  } finally {
    saving.value = false;
  }
}

async function handleProject() {
  if (!form.id) return;
  projecting.value = true;
  try {
    await orpc.hearthstone.announcement.project({ announcementId: form.id });
    showToast({ title: '投影完成', color: 'success' });
    await loadDetail(form.id);
  } catch (error) {
    showToast({ title: '投影失败', description: error instanceof Error ? error.message : String(error), color: 'error' });
  } finally {
    projecting.value = false;
  }
}

function confirmDelete(item: AnnouncementProfile) {
  announcementToDelete.value = item;
  deleteModalOpen.value = true;
}

async function handleDelete() {
  if (!announcementToDelete.value) return;

  deleting.value = true;
  try {
    await orpc.hearthstone.announcement.remove({ id: announcementToDelete.value.id });
    showToast({ title: '删除成功', color: 'success' });
    deleteModalOpen.value = false;
    if (selectedId.value === announcementToDelete.value.id) {
      resetForm();
    }
    await loadAnnouncements();
  } catch (error) {
    showToast({ title: '删除失败', description: error instanceof Error ? error.message : String(error), color: 'error' });
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void loadAnnouncements();
});
</script>
