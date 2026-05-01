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
            <UButton label="取消" color="neutral" variant="ghost" size="sm" @click="resetForm" />
            <UButton label="保存" size="sm" :loading="saving" @click="handleSubmit" />
          </div>
        </div>
        <YamlEditor v-if="isYamlMode" v-model="yamlContent" :error="yamlError" />
        <div v-else class="flex-1 overflow-y-auto p-5 space-y-4">
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
            <UFormField label="版本">
              <UInputNumber v-model="form.version" :min="1" />
            </UFormField>
          </div>
          <UFormField label="名称" required>
            <UInput v-model="form.name" placeholder="输入公告名称" />
          </UFormField>
          <UFormField label="链接">
            <div class="space-y-2">
              <div v-for="(_, index) in form.link" :key="index" class="flex gap-2">
                <UInput v-model="form.link[index]" placeholder="链接地址" class="flex-1" />
                <UButton icon="i-lucide-x" color="error" variant="ghost" size="sm" @click="removeLink(index)" />
              </div>
              <UButton icon="i-lucide-plus" label="添加链接" variant="ghost" size="sm" @click="addLink" />
            </div>
          </UFormField>
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
                  <UFormField label="赛制">
                    <UInput v-model="item.format" placeholder="赛制代码" />
                  </UFormField>
                  <UFormField label="卡牌ID">
                    <UInput v-model="item.cardId" placeholder="卡牌ID" />
                  </UFormField>
                  <UFormField label="生效日期">
                    <UInput v-model="item.effectiveDate" type="date" />
                  </UFormField>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                  <UFormField label="状态">
                    <USelect v-model="item.status" :items="statusOptions" placeholder="选择状态" class="w-full" />
                  </UFormField>
                  <UFormField label="分数">
                    <UInputNumber v-model="item.score" :min="1" placeholder="分数" />
                  </UFormField>
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
import { useConsolePlatform } from '@tcg-cards/console-platform';
import { computed, onMounted, reactive, ref } from 'vue';
import YAML from 'yaml';

import type { AnnouncementProfile } from '../../../../model/src/hearthstone/schema/announcement';

import YamlEditor from '../../components/YamlEditor.vue';

type ItemForm = {
  id?: string;
  type: string;
  effectiveDate: string;
  format: string;
  cardId: string;
  setId: string;
  ruleId: string;
  status: string;
  score?: number;
};

const platform = useConsolePlatform();
const orpc: any = platform.api.createClient();

const announcements = ref<AnnouncementProfile[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const isCreating = ref(false);
const saving = ref(false);
const deleteModalOpen = ref(false);
const deleting = ref(false);
const announcementToDelete = ref<AnnouncementProfile>();
const isYamlMode = ref(false);
const yamlContent = ref('');
const yamlError = ref('');

const form = reactive({
  id: '',
  source: 'blizzard',
  date: new Date().toISOString().split('T')[0]!,
  effectiveDate: '',
  version: 1,
  name: '',
  link: [] as string[],
  items: [] as ItemForm[],
});

const selectedAnnouncement = computed(() => announcements.value.find(a => a.id === selectedId.value) ?? null);

const sourceOptions = [
  { label: 'Blizzard', value: 'blizzard' },
  { label: '系列发售', value: 'release' },
];

const itemTypeOptions = [
  { label: '禁牌', value: 'ban' },
  { label: '其他', value: 'other' },
];

const statusOptions = [
  { label: '禁用', value: 'banned' },
  { label: '合法', value: 'legal' },
];

const selectedSource = ref('all');
const filterSourceOptions = [{ label: '全部来源', value: 'all' }, ...sourceOptions];
const filteredAnnouncements = computed(() =>
  selectedSource.value === 'all' ? announcements.value : announcements.value.filter(a => a.source === selectedSource.value),
);

function showToast(input: { title: string; description?: string; color?: 'error' | 'success' }) {
  platform.toast.show(input);
}

function toYaml() {
  return YAML.stringify({
    source: form.source,
    date: form.date,
    name: form.name,
    effectiveDate: form.effectiveDate || null,
    version: form.version,
    link: form.link,
    items: form.items.map(item => ({
      type: item.type,
      effectiveDate: item.effectiveDate || null,
      format: item.format || null,
      cardId: item.cardId || null,
      setId: item.setId || null,
      ruleId: item.ruleId || null,
      status: item.status || null,
      score: item.score ?? null,
    })),
  }, { indent: 2 });
}

function fromYaml(content: string): boolean {
  try {
    const data = YAML.parse(content);
    if (data.source !== undefined) form.source = data.source;
    if (data.date !== undefined) form.date = data.date;
    if (data.name !== undefined) form.name = data.name;
    if (data.effectiveDate !== undefined) form.effectiveDate = data.effectiveDate ?? '';
    if (data.version !== undefined) form.version = data.version ?? 1;
    if (data.link !== undefined) form.link = Array.isArray(data.link) ? data.link : [];
    if (data.items !== undefined) {
      form.items = Array.isArray(data.items) ? data.items.map((item: any) => ({
        type: item.type ?? 'ban',
        effectiveDate: item.effectiveDate ?? '',
        format: item.format ?? '',
        cardId: item.cardId ?? '',
        setId: item.setId ?? '',
        ruleId: item.ruleId ?? '',
        status: item.status ?? '',
        score: item.score ?? undefined,
      })) : [];
    }
    yamlError.value = '';
    return true;
  } catch (error) {
    yamlError.value = error instanceof Error ? error.message : 'YAML 解析错误';
    return false;
  }
}

function toggleYamlMode() {
  if (isYamlMode.value) {
    if (fromYaml(yamlContent.value)) {
      isYamlMode.value = false;
    } else {
      showToast({ title: 'YAML 格式错误', description: yamlError.value, color: 'error' });
    }
  } else {
    yamlContent.value = toYaml();
    yamlError.value = '';
    isYamlMode.value = true;
  }
}

function resetForm() {
  form.id = '';
  form.source = 'blizzard';
  form.date = new Date().toISOString().split('T')[0]!;
  form.effectiveDate = '';
  form.version = 1;
  form.name = '';
  form.link = [];
  form.items = [];
  yamlContent.value = '';
  yamlError.value = '';
  isYamlMode.value = false;
  isCreating.value = false;
  selectedId.value = null;
}

function createNew() {
  selectedId.value = null;
  resetForm();
  isCreating.value = true;
  yamlContent.value = toYaml();
}

async function selectAnnouncement(item: AnnouncementProfile) {
  selectedId.value = item.id;
  isCreating.value = false;
  form.id = item.id;
  form.source = item.source;
  form.date = item.date;
  form.name = item.name;
  form.effectiveDate = '';
  form.version = 1;
  form.link = [];
  form.items = [];

  try {
    const detail = await orpc.hearthstone.announcement.get({ id: item.id });
    form.effectiveDate = detail.effectiveDate ?? '';
    form.version = detail.version;
    form.link = detail.link ?? [];
    form.items = detail.items.map((row: any) => ({
      id: row.id,
      type: row.type,
      effectiveDate: row.effectiveDate ?? '',
      format: row.format ?? '',
      cardId: row.cardId ?? '',
      setId: row.setId ?? '',
      ruleId: row.ruleId ?? '',
      status: row.status ?? '',
      score: row.score ?? undefined,
    }));
    if (isYamlMode.value) {
      yamlContent.value = toYaml();
    }
  } catch (error) {
    showToast({
      title: '加载详情失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    });
  }
}

function addLink() {
  form.link.push('');
  if (isYamlMode.value) yamlContent.value = toYaml();
}

function removeLink(index: number) {
  form.link.splice(index, 1);
  if (isYamlMode.value) yamlContent.value = toYaml();
}

function addItem() {
  form.items.push({ type: 'ban', effectiveDate: '', format: '', cardId: '', setId: '', ruleId: '', status: '' });
  if (isYamlMode.value) yamlContent.value = toYaml();
}

function removeItem(index: number) {
  form.items.splice(index, 1);
  if (isYamlMode.value) yamlContent.value = toYaml();
}

async function loadAnnouncements() {
  loading.value = true;
  try {
    announcements.value = await orpc.hearthstone.announcement.list();
  } catch (error) {
    showToast({
      title: '加载失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    });
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  if (isYamlMode.value && !fromYaml(yamlContent.value)) {
    showToast({ title: 'YAML 格式错误', description: yamlError.value, color: 'error' });
    return;
  }

  saving.value = true;
  try {
    const payload = {
      source: form.source,
      date: form.date,
      name: form.name,
      effectiveDate: form.effectiveDate || null,
      version: form.version,
      link: form.link.filter(link => link.trim() !== ''),
    };

    if (form.id) {
      await orpc.hearthstone.announcement.update({ id: form.id, ...payload });
      showToast({ title: '更新成功', color: 'success' });
    } else {
      const result = await orpc.hearthstone.announcement.create(payload);
      if (result) {
        selectedId.value = result.id;
        form.id = result.id;
        isCreating.value = false;
      }
      showToast({ title: '创建成功', color: 'success' });
    }

    await loadAnnouncements();
  } catch (error) {
    showToast({
      title: '保存失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    });
  } finally {
    saving.value = false;
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
    if (selectedId.value === announcementToDelete.value.id) {
      selectedId.value = null;
      resetForm();
    }
    deleteModalOpen.value = false;
    await loadAnnouncements();
  } catch (error) {
    showToast({
      title: '删除失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color: 'error',
    });
  } finally {
    deleting.value = false;
  }
}

onMounted(() => {
  void loadAnnouncements();
});
</script>
