<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">规则管理</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          管理万智牌官方规则文档版本
        </p>
      </div>
      <UButton
        icon="i-lucide-upload"
        @click="showImportModal = true"
      >
        导入规则
      </UButton>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <UCard>
        <div class="flex items-center gap-4">
          <div class="rounded-lg bg-primary/10 p-3">
            <UIcon name="i-lucide-file-text" class="size-5 text-primary" />
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">版本数量</p>
            <p class="text-2xl font-semibold">{{ versions.length }}</p>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-4">
          <div class="rounded-lg bg-green-500/10 p-3">
            <UIcon name="i-lucide-check-circle" class="size-5 text-green-500" />
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">当前生效</p>
            <p class="text-2xl font-semibold">{{ activeVersions.length }}</p>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-4">
          <div class="rounded-lg bg-blue-500/10 p-3">
            <UIcon name="i-lucide-layers" class="size-5 text-blue-500" />
          </div>
          <div>
            <p class="text-sm text-gray-500 dark:text-gray-400">总规则条目</p>
            <p class="text-2xl font-semibold">{{ totalRules }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Versions Table -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold">规则版本列表</h2>
          <UButton
            icon="i-lucide-refresh-cw"
            variant="ghost"
            size="xs"
            :loading="pending"
            @click="() => refresh()"
          >
            刷新
          </UButton>
        </div>
      </template>

      <UTable
        :data="versions"
        :columns="tableColumns"
        :loading="pending"
        empty-text="暂无规则版本"
      >
        <template #status-cell="{ getValue }">
          <UBadge
            :color="getValue() === 'active' ? 'primary' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ getValue() === 'active' ? '生效中' : '已废弃' }}
          </UBadge>
        </template>

        <template #effectiveDate-cell="{ getValue }">
          <span class="text-sm">{{ getValue() || '-' }}</span>
        </template>

        <template #totalRules-cell="{ getValue }">
          <span class="text-sm">{{ getValue()?.toLocaleString() || '-' }}</span>
        </template>

        <template #importedAt-cell="{ getValue }">
          <span class="text-sm text-gray-500">
            {{ getValue() ? formatDate(getValue()) : '-' }}
          </span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-eye"
              variant="ghost"
              size="xs"
              @click="viewVersion(row.original)"
            >
              查看
            </UButton>
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              size="xs"
              color="error"
              @click="confirmDelete(row.original)"
            >
              删除
            </UButton>
          </div>
        </template>
      </UTable>
    </UCard>

    <!-- Import Modal -->
    <UModal v-model="showImportModal" :ui="{ width: 'lg' }">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold">导入规则版本</h3>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              @click="showImportModal = false"
            />
          </div>
        </template>

        <div class="space-y-4">
          <!-- File Upload -->
          <div>
            <label class="mb-2 block text-sm font-medium">规则文件 (TXT)</label>
            <UInput
              type="file"
              accept=".txt"
              @change="handleFileUpload"
            />
            <p class="mt-1 text-xs text-gray-500">
              支持从官方下载的 Comprehensive Rules TXT 文件
            </p>
          </div>

          <!-- Source ID -->
          <UFormGroup label="版本 ID">
            <UInput
              v-model="importForm.sourceId"
              placeholder="例如: 20240328"
            />
            <template #hint>
              建议使用日期格式 YYYYMMDD
            </template>
          </UFormGroup>

          <!-- Effective Date -->
          <UFormGroup label="生效日期">
            <UInput
              v-model="importForm.effectiveDate"
              type="date"
            />
          </UFormGroup>

          <!-- Published Date -->
          <UFormGroup label="发布日期">
            <UInput
              v-model="importForm.publishedAt"
              type="date"
            />
          </UFormGroup>

          <!-- Preview -->
          <div v-if="fileContent" class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
            <p class="text-xs font-medium text-gray-500">文件预览</p>
            <pre class="mt-2 max-h-32 overflow-auto text-xs">{{ fileContent.slice(0, 500) }}...</pre>
          </div>

          <!-- Progress -->
          <div v-if="importing" class="space-y-2">
            <UProgress :value="importProgress" />
            <p class="text-center text-sm text-gray-500">{{ importStatus }}</p>
          </div>

          <!-- Result -->
          <div v-if="importResult" class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
            <h4 class="text-sm font-medium text-green-800 dark:text-green-200">
              导入成功
            </h4>
            <div class="mt-2 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-gray-500">总节点:</span>
                <span class="ml-2 font-medium">{{ importResult.totalNodes }}</span>
              </div>
              <div>
                <span class="text-gray-500">新实体:</span>
                <span class="ml-2 font-medium">{{ importResult.newEntities }}</span>
              </div>
              <div>
                <span class="text-gray-500">更新实体:</span>
                <span class="ml-2 font-medium">{{ importResult.existingEntities }}</span>
              </div>
              <div>
                <span class="text-gray-500">变更:</span>
                <span class="ml-2 font-medium">
                  +{{ importResult.changes.added }} -{{ importResult.changes.removed }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="showImportModal = false"
            >
              取消
            </UButton>
            <UButton
              :loading="importing"
              :disabled="!canImport"
              @click="startImport"
            >
              开始导入
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- Delete Confirmation -->
    <UModal v-model="showDeleteModal">
      <UCard>
        <template #header>
          <h3 class="text-base font-semibold">确认删除</h3>
        </template>
        <p class="text-sm">
          确定要删除规则版本 <strong>{{ selectedVersion?.id }}</strong> 吗？<br>
          此操作不可撤销，相关的规则节点和变更记录也将被删除。
        </p>
        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              variant="ghost"
              @click="showDeleteModal = false"
            >
              取消
            </UButton>
            <UButton
              color="error"
              :loading="deleting"
              @click="deleteVersion"
            >
              确认删除
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title:  '规则管理',
});

const { $orpc } = useNuxtApp();

// Rule version type inferred from API response
type RuleVersion = {
  id:            string;
  effectiveDate: string | null;
  publishedAt:   string | null;
  totalRules:    number | null;
  status:        string;
  importedAt:    Date | null;
};

// Table column definitions
const tableColumns = [
  { accessorKey: 'id', header: '版本 ID' },
  { accessorKey: 'effectiveDate', header: '生效日期' },
  { accessorKey: 'totalRules', header: '规则数量' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'importedAt', header: '导入时间' },
  { accessorKey: 'actions', header: '操作' },
];

// Fetch rule versions from API
const { data: versions, pending, refresh } = await useAsyncData('rule-versions',
  async () => await $orpc.magic.rule.list(),
  { default: () => [] as RuleVersion[] },
);

const activeVersions = computed(() => versions.value.filter(v => v.status === 'active'));
const totalRules = computed(() => {
  return versions.value.reduce((sum, v) => sum + (v.totalRules || 0), 0);
});

// Import modal dialog state
const showImportModal = ref(false);
const fileContent = ref('');
const importing = ref(false);
const importProgress = ref(0);
const importStatus = ref('');
const importResult = ref<{
  success:          boolean;
  sourceId:         string;
  totalNodes:       number;
  newEntities:      number;
  existingEntities: number;
  changes: {
    added:    number;
    removed:  number;
    modified: number;
    renamed:  number;
    moved:    number;
    split:    number;
    merged:   number;
  };
} | null>(null);

const importForm = reactive({
  sourceId:      '',
  effectiveDate: '',
  publishedAt:   '',
});

const canImport = computed(() => {
  return importForm.sourceId && fileContent.value && !importing.value;
});

// Delete confirmation dialog state
const showDeleteModal = ref(false);
const selectedVersion = ref<{ id: string } | null>(null);
const deleting = ref(false);

// Methods
function formatDate(date: Date): string {
  return new Date(date).toLocaleString('zh-CN');
}

async function handleFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    fileContent.value = e.target?.result as string;
    // Auto-extract date from filename if possible
    const match = file.name.match(/(\d{8})/);
    if (match?.[1] && !importForm.sourceId) {
      importForm.sourceId = match[1];
    }
  };
  reader.readAsText(file);
}

async function startImport() {
  if (!canImport.value) return;

  importing.value = true;
  importProgress.value = 0;
  importStatus.value = '正在解析文件...';
  importResult.value = null;

  try {
    importProgress.value = 30;
    importStatus.value = '正在导入数据库...';

    const result = await $orpc.magic.rule.importFromText({
      sourceId:      importForm.sourceId,
      content:       fileContent.value,
      effectiveDate: importForm.effectiveDate || undefined,
      publishedAt:   importForm.publishedAt || undefined,
    });

    importProgress.value = 100;
    importStatus.value = '导入完成';
    importResult.value = result;

    // Refresh the version list
    await refresh();

    // Close modal after a short delay
    setTimeout(() => {
      showImportModal.value = false;
      resetImportForm();
    }, 2000);
  } catch (error) {
    importStatus.value = `导入失败: ${error instanceof Error ? error.message : '未知错误'}`;
  } finally {
    importing.value = false;
  }
}

function resetImportForm() {
  importForm.sourceId = '';
  importForm.effectiveDate = '';
  importForm.publishedAt = '';
  fileContent.value = '';
  importResult.value = null;
  importProgress.value = 0;
  importStatus.value = '';
}

function viewVersion(version: { id: string }) {
  navigateTo(`/magic/rule/${version.id}`);
}

function confirmDelete(version: { id: string }) {
  selectedVersion.value = version;
  showDeleteModal.value = true;
}

async function deleteVersion() {
  if (!selectedVersion.value) return;

  deleting.value = true;
  try {
    await $orpc.magic.rule.delete({ id: selectedVersion.value.id });
    await refresh();
    showDeleteModal.value = false;
    selectedVersion.value = null;
  } catch (error) {
    console.error('Failed to delete version:', error);
  } finally {
    deleting.value = false;
  }
}
</script>
