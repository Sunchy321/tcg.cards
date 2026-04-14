<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">规则管理</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          管理万智牌规则文档与规则版本
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-download-cloud"
          color="primary"
          :loading="syncing"
          @click="syncLatest"
        >
          同步最新规则
        </UButton>
        <UModal title="上传规则文件到 R2">
          <UButton
            icon="i-lucide-upload-cloud"
            variant="outline"
          >
            上传规则
          </UButton>

          <template #body>
            <div class="space-y-4">
              <div>
                <label class="mb-2 block text-sm font-medium">规则文件 (TXT)</label>
                <UInput
                  type="file"
                  accept=".txt"
                  @change="handleUploadFileSelect"
                />
                <p class="mt-1 text-xs text-gray-500">
                  版本日期将自动从文件内容中提取
                </p>
              </div>

              <div v-if="uploadFileContent" class="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                <p class="text-xs font-medium text-gray-500">文件预览</p>
                <pre class="mt-2 max-h-32 overflow-auto text-xs">{{ uploadFileContent.slice(0, 500) }}...</pre>
              </div>
            </div>
          </template>

          <template #footer="{ close }">
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="close">取消</UButton>
              <UButton
                :loading="uploading"
                :disabled="!uploadFileContent"
                @click="startUpload"
              >
                上传
              </UButton>
            </div>
          </template>
        </UModal>
        <UModal title="批量上传规则文件">
          <UButton
            icon="i-lucide-folder-up"
            variant="outline"
          >
            批量上传
          </UButton>

          <template #body>
            <div class="space-y-3">
              <div class="flex justify-center">
                <UInput
                  type="file"
                  multiple
                  accept=".txt,.pdf,.docx"
                  @change="handleBatchFileSelect"
                />
              </div>
              <div
                v-for="file in batchFiles"
                :key="file.name"
                class="flex items-center justify-between rounded-lg border p-3"
              >
                <div class="flex items-center gap-3">
                  <UIcon
                    :name="file.type === 'txt' ? 'i-lucide-file-text' : file.type === 'pdf' ? 'i-lucide-file' : 'i-lucide-file-text'"
                    class="size-5 text-gray-400"
                  />
                  <div>
                    <p class="text-sm font-medium">{{ file.name }}</p>
                    <p class="text-xs text-gray-500">
                      {{ file.versionDate ?? '未识别版本' }} · {{ file.type.toUpperCase() }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge
                    v-if="file.status === 'pending'"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  >
                    等待上传
                  </UBadge>
                  <UBadge
                    v-else-if="file.status === 'uploading'"
                    color="primary"
                    variant="subtle"
                    size="sm"
                  >
                    上传中...
                  </UBadge>
                  <UBadge
                    v-else-if="file.status === 'success'"
                    color="success"
                    variant="subtle"
                    size="sm"
                  >
                    成功
                  </UBadge>
                  <UBadge
                    v-else-if="file.status === 'error'"
                    color="error"
                    variant="subtle"
                    size="sm"
                  >
                    {{ file.error ?? '失败' }}
                  </UBadge>
                </div>
              </div>
            </div>
          </template>

          <template #footer="{ close }">
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="close">
                关闭
              </UButton>
              <UButton
                :loading="batchUploading"
                :disabled="batchFiles.length === 0 || batchFiles.every(f => f.status !== 'pending')"
                @click="startBatchUpload"
              >
                开始上传
              </UButton>
            </div>
          </template>
        </UModal>
      </div>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold">规则文档导入</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              当前仅处理 `magic-cr` TXT 文件
            </p>
          </div>
          <UBadge color="primary" variant="subtle">
            Comprehensive Rules
          </UBadge>
        </div>
      </template>

      <div class="space-y-4">
        <div>
          <label class="mb-2 block text-sm font-medium">TXT 文件</label>
          <UInput
            type="file"
            accept=".txt"
            @change="handleDocumentFileSelect"
          />
          <p class="mt-1 text-xs text-gray-500">
            会自动从正文里的生效日期提取版本号
          </p>
        </div>

        <div v-if="documentFileName" class="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800">
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="font-medium">{{ documentFileName }}</p>
              <p class="truncate text-xs text-gray-500">
                {{ documentFileContent.slice(0, 160) }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                variant="outline"
                :disabled="!documentFileContent"
                :loading="previewingDocument"
                @click="startDocumentPreview"
              >
                解析预览
              </UButton>
              <UButton
                color="primary"
                :disabled="!documentFileContent"
                :loading="importingDocument"
                @click="startDocumentImport"
              >
                导入数据库
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard v-if="documentPreview">
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-sm font-semibold">文档解析预览</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              版本 {{ documentPreview.versionTag }} · {{ documentPreview.parserStrategy }}
            </p>
          </div>
          <UBadge color="success" variant="subtle">
            {{ documentPreview.effectiveDate ?? '未知日期' }}
          </UBadge>
        </div>
      </template>

      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <p class="text-xs text-gray-500">Heading</p>
          <p class="mt-1 text-xl font-semibold">{{ documentPreview.summary.heading }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <p class="text-xs text-gray-500">Content</p>
          <p class="mt-1 text-xl font-semibold">{{ documentPreview.summary.content }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <p class="text-xs text-gray-500">Example</p>
          <p class="mt-1 text-xl font-semibold">{{ documentPreview.summary.example }}</p>
        </div>
        <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
          <p class="text-xs text-gray-500">Term</p>
          <p class="mt-1 text-xl font-semibold">{{ documentPreview.summary.term }}</p>
        </div>
      </div>

      <div class="mt-4">
        <h3 class="mb-2 text-sm font-medium">样例节点</h3>
        <div class="max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table class="w-full text-left text-sm">
            <thead class="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th class="px-3 py-2">Node ID</th>
                <th class="px-3 py-2">类型</th>
                <th class="px-3 py-2">Path</th>
                <th class="px-3 py-2">内容</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="node in documentPreview.sampleNodes"
                :key="node.id"
                class="border-t border-gray-100 dark:border-gray-800"
              >
                <td class="px-3 py-2 font-mono text-xs">{{ node.nodeId }}</td>
                <td class="px-3 py-2">{{ node.nodeKind }}</td>
                <td class="px-3 py-2 font-mono text-xs">{{ node.path }}</td>
                <td class="max-w-md truncate px-3 py-2 text-xs text-gray-500">
                  {{ node.content ?? '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </UCard>

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
          <div>
            <h2 class="text-sm font-semibold">版本列表</h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              同时显示数据库已有版本与 R2 中待导入文件
            </p>
          </div>
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
            :color="getStatus(getValue() as string).color"
            variant="subtle"
            size="sm"
          >
            {{ getStatus(getValue() as string).label }}
          </UBadge>
        </template>

        <template #r2Status-cell="{ getValue }">
          <UBadge
            :color="getFileStatus(getValue() as RuleVersion['r2Status']).color"
            variant="subtle"
            size="sm"
          >
            {{ getFileStatus(getValue() as RuleVersion['r2Status']).label }}
          </UBadge>
        </template>

        <template #effectiveDate-cell="{ getValue }">
          <span class="text-sm">{{ getValue() ?? '-' }}</span>
        </template>

        <template #totalRules-cell="{ getValue }">
          <span class="text-sm">{{ getValue()?.toLocaleString() ?? '-' }}</span>
        </template>

        <template #importedAt-cell="{ getValue }">
          <span class="text-sm text-gray-500">
            {{ getValue() ? formatDate(getValue() as Date) : '-' }}
          </span>
        </template>

        <template #actions-cell="{ row }">
          <div class="flex items-center gap-2">
            <UButton
              v-if="row.original.r2Status === 'pending'"
              icon="i-lucide-play"
              variant="ghost"
              size="xs"
              color="primary"
              :loading="loadingId === row.original.id"
              @click="loadRule(row.original)"
            >
              导入
            </UButton>
            <UButton
              icon="i-lucide-eye"
              variant="ghost"
              size="xs"
              @click="viewVersion(row.original)"
            >
              查看
            </UButton>
            <UModal>
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                size="xs"
                color="error"
              >
                删除
              </UButton>

              <template #content>
                <p class="text-sm">
                  确定要删除规则版本 <strong>{{ row.original.id }}</strong> 吗？<br>
                  此操作不可撤销，相关的规则节点和变更记录也将被删除。
                </p>
              </template>

              <template #footer>
                <div class="flex justify-end gap-2">
                  <UButton color="error" @click="deleteVersion(row.original)">
                    确认删除
                  </UButton>
                </div>
              </template>
            </UModal>
          </div>
        </template>
      </UTable>
    </UCard>

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
  r2Status:      'imported' | 'pending' | 'missing';
  r2Key:         string | null;
};

type PreviewNode = {
  id:       string;
  nodeId:   string;
  nodeKind: 'heading' | 'term' | 'content' | 'example';
  path:     string;
  content:  string | null;
};

type DocumentPreview = {
  documentId:     'magic-cr';
  versionId:      string;
  versionTag:     string;
  effectiveDate:  string | null;
  publishedAt:    string | null;
  parserStrategy: string;
  summary: {
    heading: number;
    term:    number;
    content: number;
    example: number;
  };
  sampleNodes: PreviewNode[];
};

const statusMap: Record<string, { label: string, color: 'primary' | 'warning' | 'neutral' }> = {
  active:  { label: '生效中', color: 'primary' },
  pending: { label: '待导入', color: 'warning' },
};

function getStatus(value: string) {
  return statusMap[value] ?? { label: '已废弃', color: 'neutral' };
}

function getFileStatus(value: RuleVersion['r2Status']) {
  if (value === 'imported') {
    return { label: 'R2 已归档', color: 'success' as const };
  }
  if (value === 'pending') {
    return { label: 'R2 待导入', color: 'warning' as const };
  }
  return { label: 'R2 缺失', color: 'neutral' as const };
}

// Table column definitions
const tableColumns = [
  { accessorKey: 'id', header: '版本 ID' },
  { accessorKey: 'effectiveDate', header: '生效日期' },
  { accessorKey: 'totalRules', header: '规则数量' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'r2Status', header: '文件状态' },
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
  return versions.value.reduce((sum, v) => sum + (v.totalRules ?? 0), 0);
});

// Sync latest state
const syncing = ref(false);
const syncResult = ref<{
  success:    boolean;
  sourceId:   string;
  message:    string;
  downloaded: boolean;
} | null>(null);

// Upload modal state
const uploadFileContent = ref('');
const uploading = ref(false);
const documentFileName = ref('');
const documentFileContent = ref('');
const documentPreview = ref<DocumentPreview | null>(null);
const previewingDocument = ref(false);
const importingDocument = ref(false);

function handleUploadFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    uploadFileContent.value = e.target?.result as string;
  };
  reader.readAsText(file);
}

function handleDocumentFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  documentFileName.value = file.name;
  documentPreview.value = null;

  const reader = new FileReader();
  reader.onload = e => {
    documentFileContent.value = String(e.target?.result ?? '');
  };
  reader.readAsText(file);
}

async function startUpload() {
  if (!uploadFileContent.value) return;
  uploading.value = true;
  try {
    await $orpc.magic.rule.uploadToR2({ content: uploadFileContent.value, fileType: 'txt' });
    uploadFileContent.value = '';
    await refresh();
  } catch (error) {
    console.error('Failed to upload rule file:', error);
  } finally {
    uploading.value = false;
  }
}

// Delete loading state
const deleting = ref(false);

// Loading state
const loadingId = ref<string>();

// Methods
function formatDate(date: Date): string {
  return new Date(date).toLocaleString('zh-CN');
}

interface BatchUploadFile {
  name:        string;
  type:        'txt' | 'pdf' | 'docx';
  content:     string;
  versionDate: string;
  status:      'pending' | 'uploading' | 'success' | 'error';
  error?:      string;
}

const batchFiles = ref<BatchUploadFile[]>([]);
const batchUploading = ref(false);

async function handleBatchFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length === 0) return;

  batchFiles.value = [];

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'pdf', 'docx'].includes(ext ?? '')) continue;

    const fileType = ext as 'txt' | 'pdf' | 'docx';
    const versionMatch = file.name.match(/(\d{8})/);
    const versionDate = versionMatch?.[1] ?? '';

    try {
      const content = await readFileAsString(file);
      batchFiles.value.push({
        name:   file.name,
        type:   fileType,
        content,
        versionDate,
        status: 'pending',
      });
    } catch (error) {
      console.error(`Failed to read file ${file.name}:`, error);
    }
  }
}

function readFileAsString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    if (file.name.endsWith('.txt')) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  });
}

async function startBatchUpload() {
  batchUploading.value = true;

  for (const file of batchFiles.value) {
    if (file.status !== 'pending') continue;

    file.status = 'uploading';
    try {
      let versionDate = file.versionDate;

      if (file.type === 'txt' && !versionDate) {
        const match = file.content.match(/effective as of [A-Za-z]+ \d{1,2}, \d{4}/i);
        if (match) {
          const date = new Date(match[0].replace('effective as of ', ''));
          if (!isNaN(date.getTime())) {
            versionDate = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
          }
        }
      }

      if (!versionDate) {
        file.status = 'error';
        file.error = '无法识别版本日期';
        continue;
      }

      let content: string;
      if (file.type === 'txt') {
        content = file.content;
      } else {
        const base64Data = file.content.split(',')[1];
        if (!base64Data) {
          file.status = 'error';
          file.error = '文件读取失败';
          continue;
        }
        content = base64Data;
      }

      await $orpc.magic.rule.uploadToR2({
        content,
        fileType: file.type,
        versionDate,
      });
      file.status = 'success';
    } catch (error) {
      file.status = 'error';
      file.error = error instanceof Error ? error.message : '上传失败';
    }
  }

  batchUploading.value = false;
  await refresh();
}

async function syncLatest() {
  syncing.value = true;
  syncResult.value = null;

  try {
    const result = await $orpc.magic.rule.syncLatest();
    syncResult.value = result;

    if (result.success) {
      // Show success notification
      // Refresh the version list
      await refresh();
    }
  } catch (error) {
    console.error('Failed to sync latest rules:', error);
  } finally {
    syncing.value = false;
  }
}

async function startDocumentPreview() {
  if (!documentFileContent.value) return;

  previewingDocument.value = true;
  try {
    documentPreview.value = await $orpc.magic.document.parsePreview({
      documentId: 'magic-cr',
      content:    documentFileContent.value,
    });
  } catch (error) {
    console.error('Failed to preview document:', error);
  } finally {
    previewingDocument.value = false;
  }
}

async function startDocumentImport() {
  if (!documentFileContent.value) return;

  importingDocument.value = true;
  try {
    const result = await $orpc.magic.document.importVersion({
      documentId: 'magic-cr',
      content:    documentFileContent.value,
    });

    if (documentPreview.value?.versionId !== result.versionId) {
      documentPreview.value = await $orpc.magic.document.parsePreview({
        documentId: 'magic-cr',
        content:    documentFileContent.value,
      });
    }

    await refresh();
  } catch (error) {
    console.error('Failed to import document:', error);
  } finally {
    importingDocument.value = false;
  }
}

function viewVersion(version: { id: string }) {
  navigateTo(`/magic/rule/view?version=${version.id}`);
}

async function deleteVersion(version: { id: string }) {
  deleting.value = true;
  try {
    await $orpc.magic.rule.delete({ id: version.id });
    await refresh();
  } catch (error) {
    console.error('Failed to delete version:', error);
  } finally {
    deleting.value = false;
  }
}

async function loadRule(version: { id: string }) {
  loadingId.value = version.id;
  try {
    const result = await $orpc.magic.rule.loadFromData({ versionId: version.id });
    console.log('[LoadFromData] Import completed:', result);
    await refresh();
  } catch (error) {
    console.error('Failed to load rule:', error);
  } finally {
    loadingId.value = undefined;
  }
}
</script>
