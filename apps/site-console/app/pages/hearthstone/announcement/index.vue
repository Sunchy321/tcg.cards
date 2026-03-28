<template>
  <div class="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
    <!-- Left: Compact announcement list -->
    <UCard class="w-72 shrink-0 flex flex-col">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">公告列表</h3>
        <UButton
          icon="i-lucide-plus"
          size="xs"
          variant="ghost"
          @click="createNew"
        />
      </div>

      <USelect
        v-model="selectedSource"
        :items="filterSourceOptions"
        size="xs"
        class="mb-3 w-full"
      />

      <div class="flex-1 overflow-y-auto -mx-4 px-4">
        <div
          v-for="item in filteredAnnouncements"
          :key="item.id"
          class="group relative flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors"
          :class="selectedId === item.id
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          "
          @click="selectAnnouncement(item)"
        >
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium truncate">{{ item.name }}</div>
            <div class="text-xs text-gray-400 flex items-center gap-1">
              <span>{{ item.date }}</span>
              <span>·</span>
              <UBadge
                :label="item.source"
                :color="getSourceColor(item.source)"
                variant="soft"
                size="xs"
                class="scale-75 origin-left"
              />
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

        <p v-if="filteredAnnouncements.length === 0 && !loading" class="text-sm text-gray-400 text-center py-8">
          暂无公告
        </p>
      </div>
    </UCard>

    <!-- Right: Announcement editor -->
    <div class="flex-1 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col min-h-0 overflow-hidden">
      <template v-if="selectedAnnouncement || isCreating">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-file-text" class="text-gray-400" />
            <span class="text-sm text-gray-500">编辑公告</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              :icon="isYamlMode ? 'i-lucide-form-input' : 'i-lucide-file-code'"
              :label="isYamlMode ? '表单模式' : 'YAML模式'"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="toggleYamlMode"
            />
            <UButton
              label="取消"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="resetForm"
            />
            <UButton
              label="保存"
              size="sm"
              :loading="saving"
              @click="handleSubmit"
            />
          </div>
        </div>

        <!-- YAML Editor Mode -->
        <YamlEditor
          v-if="isYamlMode"
          v-model="yamlContent"
          :error="yamlError"
        />

        <!-- Form Editor Mode -->
        <div v-else class="flex-1 overflow-y-auto p-6 space-y-4">
          <div class="grid grid-cols-3 gap-4">
            <UFormField label="来源" required>
              <USelect
                v-model="formState.source"
                :items="sourceOptions"
                placeholder="选择来源"
                class="w-full"
              />
            </UFormField>

            <UFormField label="日期" required>
              <UInput v-model="formState.date" type="date" />
            </UFormField>

            <UFormField label="生效日期">
              <UInput v-model="formState.effectiveDate" type="date" :nullable="true" />
            </UFormField>
          </div>

          <UFormField label="名称" required>
            <UInput v-model="formState.name" placeholder="输入公告名称" />
          </UFormField>

          <UFormField label="版本" required>
            <UInputNumber v-model="formState.version" :min="1" />
          </UFormField>

          <UFormField label="链接">
            <div class="space-y-2">
              <div v-for="(link, index) in formState.link" :key="index" class="flex gap-2">
                <UInput v-model="formState.link[index]" placeholder="输入链接地址" class="flex-1" />
                <UButton
                  icon="i-lucide-x"
                  color="error"
                  variant="ghost"
                  size="sm"
                  @click="removeLink(index)"
                />
              </div>
              <UButton
                icon="i-lucide-plus"
                label="添加链接"
                variant="ghost"
                size="sm"
                @click="addLink"
              />
            </div>
          </UFormField>

          <!-- Announcement Items Section -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-800">
            <div class="flex items-center justify-between mb-4">
              <h4 class="text-sm font-medium">公告条目</h4>
              <UButton
                icon="i-lucide-plus"
                label="添加条目"
                size="xs"
                @click="addItem"
              />
            </div>

            <div class="space-y-3">
              <UCard
                v-for="(item, index) in formState.items"
                :key="index"
                class="relative"
              >
                <div class="absolute top-2 right-2">
                  <UButton
                    icon="i-lucide-x"
                    color="error"
                    variant="ghost"
                    size="xs"
                    @click="removeItem(index)"
                  />
                </div>

                <div class="grid grid-cols-4 gap-3 pr-8">
                  <UFormField label="类型" required>
                    <USelect
                      v-model="item.type"
                      :items="itemTypeOptions"
                      placeholder="选择类型"
                      class="w-full"
                    />
                  </UFormField>

                  <UFormField label="赛制">
                    <UInput v-model="item.format" placeholder="赛制代码" :nullable="true" />
                  </UFormField>

                  <UFormField label="卡牌ID">
                    <UInput v-model="item.cardId" placeholder="卡牌ID" :nullable="true" />
                  </UFormField>

                  <UFormField label="生效日期">
                    <UInput v-model="item.effectiveDate" type="date" :nullable="true" />
                  </UFormField>
                </div>

                <div class="grid grid-cols-2 gap-3 mt-3">
                  <UFormField label="状态">
                    <USelect
                      v-model="item.status"
                      :items="statusOptions"
                      placeholder="选择状态"
                      class="w-full"
                      :nullable="true"
                    />
                  </UFormField>

                  <UFormField label="分数">
                    <UInputNumber v-model="item.score" :min="1" placeholder="分数" />
                  </UFormField>
                </div>
              </UCard>

              <p v-if="formState.items.length === 0" class="text-sm text-gray-400 text-center py-8">
                暂无条目，点击"添加条目"创建
              </p>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="flex flex-col items-center justify-center h-full text-gray-400">
        <UIcon name="i-lucide-file-text" class="size-12 mb-4 opacity-50" />
        <p class="text-sm">选择左侧公告进行编辑，或创建新公告</p>
        <UButton
          class="mt-4"
          icon="i-lucide-plus"
          label="创建新公告"
          @click="createNew"
        />
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <UModal v-model:open="deleteModalOpen" title="确认删除" class="sm:max-w-sm">
      <template #body>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          确定要删除公告 "{{ announcementToDelete?.name }}" 吗？此操作不可撤销。
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="deleteModalOpen = false" />
          <UButton
            label="删除"
            color="error"
            :loading="deleting"
            @click="handleDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import YAML from 'yaml';
import type { Announcement } from '#model/hearthstone/schema/announcement';

definePageMeta({
  layout: 'admin',
  title:  '公告管理',
});

const { $orpc } = useNuxtApp();
const toast = useToast();

// Data
const announcements = ref<Announcement[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);
const isCreating = ref(false);
const saving = ref(false);

// Delete modal state
const deleteModalOpen = ref(false);
const deleting = ref(false);
const announcementToDelete = ref<Announcement | null>(null);

// YAML mode
const isYamlMode = ref(false);
const yamlContent = ref('');
const yamlError = ref('');

// Selected announcement computed
const selectedAnnouncement = computed(() =>
  announcements.value.find(a => a.id === selectedId.value) || null,
);

// Form state - use undefined for input fields to match UInput type
const formState = reactive({
  id:            '',
  source:        'blizzard',
  date:          new Date().toISOString().split('T')[0]!,
  effectiveDate: undefined as string | undefined,
  name:          '',
  version:       1,
  link:          [] as string[],
  items:         [] as AnnouncementItemForm[],
});

type AnnouncementItemForm = {
  id?:            string;
  type:           string;
  effectiveDate?: string;
  format?:        string;
  cardId?:        string;
  setId?:         string;
  ruleId?:        string;
  status?:        string;
  score?:         number;
};

// Options
const sourceOptions = [
  { label: 'Blizzard', value: 'blizzard' },
  { label: '其他', value: 'other' },
];

const itemTypeOptions = [
  { label: '禁牌', value: 'ban' },
  { label: '限制', value: 'restriction' },
  { label: '规则更新', value: 'rule' },
  { label: '其他', value: 'other' },
];

const statusOptions = [
  { label: '禁用', value: 'banned' },
  { label: '限制', value: 'restricted' },
  { label: '合法', value: 'legal' },
];

// Filter
const selectedSource = ref<string>('all');

const filterSourceOptions = [
  { label: '全部来源', value: 'all' },
  ...sourceOptions,
];

const filteredAnnouncements = computed(() => {
  if (selectedSource.value === 'all') {
    return announcements.value;
  }
  return announcements.value.filter(a => a.source === selectedSource.value);
});

function getSourceColor(source: string) {
  switch (source) {
  case 'blizzard':
    return 'primary';
  case 'official':
    return 'success';
  default:
    return 'neutral';
  }
}

function toYaml(): string {
  const data = {
    source:        formState.source,
    date:          formState.date,
    name:          formState.name,
    version:       formState.version,
    effectiveDate: formState.effectiveDate ?? null,
    link:          formState.link,
    items:         formState.items.map(item => ({
      type:          item.type,
      effectiveDate: item.effectiveDate ?? null,
      format:        item.format ?? null,
      cardId:        item.cardId ?? null,
      setId:         item.setId ?? null,
      ruleId:        item.ruleId ?? null,
      status:        item.status ?? null,
      score:         item.score ?? null,
    })),
  };
  return YAML.stringify(data, { indent: 2 });
}

function fromYaml(yaml: string): boolean {
  try {
    const data = YAML.parse(yaml);

    if (data.source !== undefined) formState.source = data.source;
    if (data.date !== undefined) formState.date = data.date;
    if (data.name !== undefined) formState.name = data.name;
    if (data.version !== undefined) formState.version = data.version;
    if (data.effectiveDate !== undefined) formState.effectiveDate = data.effectiveDate ?? undefined;
    if (data.link !== undefined) formState.link = Array.isArray(data.link) ? data.link : [];
    if (data.items !== undefined) {
      formState.items = Array.isArray(data.items)
        ? data.items.map((item: any) => ({
          type:          item.type || 'ban',
          effectiveDate: item.effectiveDate ?? undefined,
          format:        item.format ?? undefined,
          cardId:        item.cardId ?? undefined,
          setId:         item.setId ?? undefined,
          ruleId:        item.ruleId ?? undefined,
          status:        item.status ?? undefined,
          score:         item.score ?? undefined,
        }))
        : [];
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
    // Switching from YAML to Form - parse YAML
    if (fromYaml(yamlContent.value)) {
      isYamlMode.value = false;
    } else {
      toast.add({
        title:       'YAML 格式错误',
        description: yamlError.value,
        color:       'error',
      });
    }
  } else {
    // Switching from Form to YAML - convert to YAML
    yamlContent.value = toYaml();
    yamlError.value = '';
    isYamlMode.value = true;
  }
}

function resetForm() {
  formState.id = '';
  formState.source = 'blizzard';
  formState.date = new Date().toISOString().split('T')[0]!;
  formState.effectiveDate = undefined;
  formState.name = '';
  formState.version = 1;
  formState.link = [];
  formState.items = [];
  yamlContent.value = '';
  yamlError.value = '';
  isYamlMode.value = false;
  isCreating.value = false;
  selectedId.value = null;
}

function createNew() {
  selectedId.value = null;
  isCreating.value = true;
  resetForm();
  yamlContent.value = toYaml();
}

async function selectAnnouncement(announcement: Announcement) {
  selectedId.value = announcement.id;
  isCreating.value = false;
  formState.id = announcement.id;
  formState.source = announcement.source;
  formState.date = announcement.date;
  formState.name = announcement.name;
  formState.version = announcement.version;

  // Load full announcement details
  try {
    const detail = await $orpc.hearthstone.announcement.get({ id: announcement.id });
    formState.effectiveDate = detail.effectiveDate ?? undefined;
    formState.link = detail.link || [];
    formState.items = detail.items.map(item => ({
      id:            item.id,
      type:          item.type,
      effectiveDate: item.effectiveDate ?? undefined,
      format:        item.format ?? undefined,
      cardId:        item.cardId ?? undefined,
      setId:         item.setId ?? undefined,
      ruleId:        item.ruleId ?? undefined,
      status:        item.status ?? undefined,
      score:         item.score ?? undefined,
    }));

    // Update YAML content if in YAML mode
    if (isYamlMode.value) {
      yamlContent.value = toYaml();
    }
  } catch (error) {
    toast.add({
      title:       '加载详情失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color:       'error',
    });
    formState.link = [];
    formState.items = [];
  }
}

function addLink() {
  formState.link.push('');
  if (isYamlMode.value) yamlContent.value = toYaml();
}

function removeLink(index: number) {
  formState.link.splice(index, 1);
  if (isYamlMode.value) yamlContent.value = toYaml();
}

function addItem() {
  formState.items.push({
    type: 'ban',
  });
  if (isYamlMode.value) yamlContent.value = toYaml();
}

function removeItem(index: number) {
  formState.items.splice(index, 1);
  if (isYamlMode.value) yamlContent.value = toYaml();
}

async function loadAnnouncements() {
  loading.value = true;
  try {
    const data = await $orpc.hearthstone.announcement.list();
    announcements.value = data as Announcement[];
  } catch (error) {
    toast.add({
      title:       '加载失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color:       'error',
    });
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  // If in YAML mode, parse YAML first
  if (isYamlMode.value) {
    if (!fromYaml(yamlContent.value)) {
      toast.add({
        title:       'YAML 格式错误',
        description: yamlError.value,
        color:       'error',
      });
      return;
    }
  }

  saving.value = true;
  try {
    const payload = {
      source:        formState.source,
      date:          formState.date,
      name:          formState.name,
      version:       formState.version,
      effectiveDate: formState.effectiveDate ?? null,
      link:          formState.link.filter(l => l.trim() !== ''),
    };

    if (formState.id) {
      await $orpc.hearthstone.announcement.update({
        id: formState.id,
        ...payload,
      });
      toast.add({
        title: '更新成功',
        color: 'success',
      });
    } else {
      const result = await $orpc.hearthstone.announcement.create(payload);
      if (result) {
        selectedId.value = result.id;
        formState.id = result.id;
        isCreating.value = false;
      }
      toast.add({
        title: '创建成功',
        color: 'success',
      });
    }

    await loadAnnouncements();
  } catch (error) {
    toast.add({
      title:       '保存失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color:       'error',
    });
  } finally {
    saving.value = false;
  }
}

function confirmDelete(announcement: Announcement) {
  announcementToDelete.value = announcement;
  deleteModalOpen.value = true;
}

async function handleDelete() {
  if (!announcementToDelete.value) return;

  deleting.value = true;
  try {
    await $orpc.hearthstone.announcement.remove({ id: announcementToDelete.value.id });

    toast.add({
      title: '删除成功',
      color: 'success',
    });

    if (selectedId.value === announcementToDelete.value.id) {
      selectedId.value = null;
      resetForm();
    }

    deleteModalOpen.value = false;
    await loadAnnouncements();
  } catch (error) {
    toast.add({
      title:       '删除失败',
      description: error instanceof Error ? error.message : '请稍后重试',
      color:       'error',
    });
  } finally {
    deleting.value = false;
  }
}

// Load on mount
onMounted(() => {
  loadAnnouncements();
});
</script>
