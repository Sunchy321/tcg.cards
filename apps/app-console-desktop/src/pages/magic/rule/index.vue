<template>
  <div class="desktop-page h-full space-y-4 overflow-y-auto">
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center gap-6">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-scroll-text" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">规则</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            从威世智官网下载完整规则文件，并导入本地规则文章。
          </p>
        </div>
        <div class="ml-auto flex gap-2">
          <UButton to="/magic/publish?type=document" label="发布文档" icon="i-lucide-upload" color="neutral" variant="soft" />
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="soft"
            :loading="loadingVersions"
            :disabled="downloading || importingVersion != null || importingTranslation != null"
            @click="refreshVersions"
          />
          <UButton
            label="下载最新规则"
            icon="i-lucide-download"
            :loading="downloading"
            :disabled="importingVersion != null || importingTranslation != null"
            @click="downloadLatest"
          />
        </div>
      </div>
      <p v-if="listWarning" class="mt-2 text-sm text-warning">
        {{ listWarning }}
      </p>
      <p v-if="importError" role="alert" class="mt-2 whitespace-pre-line text-sm text-error">
        {{ importError }}
      </p>
      <p v-if="!translationsConfigured && !translationListFailed" class="mt-2 text-sm text-muted">
        导入中文前，请先在 <NuxtLink to="/settings/games/magic" class="text-primary underline">Magic 设置</NuxtLink> 中配置完整规则中文译本目录。
      </p>
    </div>

    <div class="rounded-xl border border-slate-200 bg-white">
      <table v-if="rows.length > 0" class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left text-muted">
            <th class="px-4 py-3 font-medium">
              版本
            </th>
            <th class="px-4 py-3 font-medium">
              本地
            </th>
            <th class="px-4 py-3 font-medium">
              云端
            </th>
            <th class="px-4 py-3 font-medium">
              本地文章
            </th>
            <th class="px-4 py-3 font-medium">
              中文译文
            </th>
            <th class="px-4 py-3 font-medium">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.date"
            class="border-b border-slate-100 last:border-b-0"
          >
            <td class="px-4 py-3">
              <span class="font-medium">{{ formatDate(row.date) }}</span>
            </td>
            <td class="px-4 py-3">
              <div v-if="hasFiles(row.local)" class="flex gap-1">
                <UBadge
                  v-for="format in presentFormats(row.local)"
                  :key="format"
                  :label="format.toUpperCase()"
                  color="neutral"
                  variant="soft"
                  size="xs"
                />
              </div>
              <span v-else class="text-muted">未下载</span>
            </td>
            <td class="px-4 py-3">
              <div v-if="hasFiles(row.cloud)" class="flex gap-1">
                <UBadge
                  v-for="format in presentFormats(row.cloud)"
                  :key="format"
                  :label="format.toUpperCase()"
                  color="neutral"
                  variant="soft"
                  size="xs"
                />
              </div>
              <span v-else class="text-muted">未同步</span>
            </td>
            <td class="px-4 py-3">
              <UBadge v-if="row.imported" label="已导入" color="success" variant="soft" size="xs" />
              <span v-else class="text-muted">{{ localListFailed ? '状态未知' : '未导入' }}</span>
              <span v-if="row.totalNodes != null" class="ml-2 text-xs text-muted">{{ row.totalNodes }} 个条目</span>
            </td>
            <td class="px-4 py-3">
              <UBadge v-if="row.translationImported" label="已导入" color="success" variant="soft" size="xs" />
              <span v-else class="text-muted">{{ translationListFailed ? '状态未知' : row.translationAvailable ? '可导入' : '暂无译文' }}</span>
            </td>
            <td class="space-x-2 px-4 py-3">
              <UButton
                :label="row.imported ? '再次导入' : '导入'"
                icon="i-lucide-file-input"
                size="xs"
                variant="soft"
                :loading="importingVersion === row.date"
                :disabled="!row.local.txt || downloading || importingTranslation != null || (importingVersion != null && importingVersion !== row.date)"
                @click="importVersion(row.date)"
              />
              <UButton
                :label="row.translationImported ? '再次导入中文' : '导入中文'"
                icon="i-lucide-languages"
                size="xs"
                variant="soft"
                :loading="importingTranslation === row.date"
                :disabled="!row.imported || !row.translationAvailable || downloading || importingVersion != null || (importingTranslation != null && importingTranslation !== row.date)"
                @click="importTranslation(row.date)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="flex h-40 items-center justify-center text-sm text-muted">
        {{ loadingVersions ? '正在加载版本…' : '暂无版本,点击右上角「下载最新规则」开始' }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';

import type { RouterClient } from '@orpc/server';
import type { DesktopRouter } from '@tcg-cards/console-api';

import { orpc } from '~/lib/orpc';

definePageMeta({
  layout: 'admin',
});

const remote = useApiClient() as RouterClient<DesktopRouter>;

/** Tracks which original file formats are available for one edition. */
interface FileFlags {
  txt: boolean;
  doc: boolean;
  pdf: boolean;
}

/** Combines source-file availability with persistent local article state. */
interface VersionRow {
  date:                 string;
  local:                FileFlags;
  cloud:                FileFlags;
  imported:             boolean;
  totalNodes:           number | null;
  translationAvailable: boolean;
  translationImported:  boolean;
}

const fileFormats = ['txt', 'doc', 'pdf'] as const;

/** Starts a format group with no downloaded files. */
function emptyFlags(): FileFlags {
  return { txt: false, doc: false, pdf: false };
}

/** Lists formats available in one file group. */
function presentFormats(flags: FileFlags) {
  return fileFormats.filter(format => flags[format]);
}

/** Detects whether a version has any original files. */
function hasFiles(flags: FileFlags) {
  return presentFormats(flags).length > 0;
}

/** Formats compact official edition dates for display. */
function formatDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return value.length === 8
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

/** Extracts a readable operation failure. */
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Merges downloaded source files and local article state by edition date. */
function mergeVersions(
  local: Awaited<ReturnType<typeof orpc.magic.rule.listLocal>>,
  cloud: Awaited<ReturnType<typeof remote.magic.rule.listFiles>>,
  translations: Awaited<ReturnType<typeof orpc.magic.rule.listTranslations>>['versions'],
): VersionRow[] {
  const rows = new Map<string, VersionRow>();

  for (const version of cloud) {
    rows.set(version.id, {
      date:                 version.id,
      local:                emptyFlags(),
      cloud:                { ...version.files },
      imported:             false,
      totalNodes:           null,
      translationAvailable: false,
      translationImported:  false,
    });
  }

  for (const version of local) {
    const row = rows.get(version.date) ?? {
      date:                 version.date,
      local:                emptyFlags(),
      cloud:                emptyFlags(),
      imported:             false,
      totalNodes:           null,
      translationAvailable: false,
      translationImported:  false,
    };
    row.local = { ...version.files };
    row.imported = version.imported;
    row.totalNodes = version.totalNodes;
    rows.set(version.date, row);
  }

  for (const translation of translations) {
    const row = rows.get(translation.date) ?? {
      date:                 translation.date, local:                emptyFlags(), cloud:                emptyFlags(), imported:             false, totalNodes:           null,
      translationAvailable: false, translationImported:  false,
    };
    row.translationAvailable = translation.available;
    row.translationImported = translation.imported;
    rows.set(translation.date, row);
  }

  return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date));
}

const rows = ref<VersionRow[]>([]);
const loadingVersions = ref(false);
const listWarning = ref<string | null>(null);
const localListFailed = ref(false);
const importingVersion = ref<string | null>(null);
const importError = ref<string | null>(null);
const importingTranslation = ref<string | null>(null);
const translationsConfigured = ref(true);
const translationListFailed = ref(false);

/** Reloads source availability and saved local article status. */
async function refreshVersions() {
  loadingVersions.value = true;
  try {
    const [local, cloud, translations] = await Promise.allSettled([
      orpc.magic.rule.listLocal(),
      remote.magic.rule.listFiles(),
      orpc.magic.rule.listTranslations(),
    ]);

    const warnings = [
      ...(local.status === 'rejected' ? [`本地版本读取失败:${errorMessage(local.reason)}`] : []),
      ...(cloud.status === 'rejected' ? [`云端版本获取失败:${errorMessage(cloud.reason)}`] : []),
      ...(translations.status === 'rejected' ? [`中文译本读取失败：${errorMessage(translations.reason)}`] : []),
    ];
    localListFailed.value = local.status === 'rejected';
    translationListFailed.value = translations.status === 'rejected';
    translationsConfigured.value = translations.status === 'fulfilled' && translations.value.configured;
    listWarning.value = warnings.length > 0 ? warnings.join(' ') : null;

    rows.value = mergeVersions(
      local.status === 'fulfilled' ? local.value : [],
      cloud.status === 'fulfilled' ? cloud.value : [],
      translations.status === 'fulfilled' ? translations.value.versions : [],
    );
  } finally {
    loadingVersions.value = false;
  }
}

onMounted(() => {
  void refreshVersions();
});

const downloading = ref(false);

/** Downloads official originals locally without independently fetching a remote copy. */
async function downloadLatest() {
  if (downloading.value || importingVersion.value != null || importingTranslation.value != null) return;
  downloading.value = true;
  try {
    const result = await orpc.magic.rule.downloadLatest();
    useToast().add({
      title:       result.downloaded ? '已下载最新规则' : '已是最新',
      description: `版本 ${formatDate(result.version)} 已保存在本地。`,
      color:       result.downloaded ? 'success' : 'info',
    });
    await refreshVersions();
  } catch (error) {
    useToast().add({ title: '下载失败', description: errorMessage(error), color: 'error' });
  } finally {
    downloading.value = false;
  }
}

/** Imports a downloaded edition and refreshes its saved status, including after failures. */
async function importVersion(version: string) {
  if (importingVersion.value != null || importingTranslation.value != null || downloading.value) return;
  importingVersion.value = version;
  importError.value = null;
  try {
    const result = await orpc.magic.rule.importVersion({ version });
    useToast().add({
      title:       '导入完成',
      description: `${formatDate(version)}，共 ${result.totalNodes} 个规则条目。`,
      color:       'success',
    });
  } catch (error) {
    importError.value = `${formatDate(version)} 导入失败：${errorMessage(error)}`;
    useToast().add({ title: '导入失败', description: importError.value, color: 'error' });
  } finally {
    await refreshVersions();
    importingVersion.value = null;
  }
}

/** Imports a local Chinese edition and refreshes its persistent selection after completion. */
async function importTranslation(version: string) {
  if (importingTranslation.value != null || importingVersion.value != null || downloading.value) return;
  importingTranslation.value = version;
  importError.value = null;
  try {
    const result = await orpc.magic.rule.importTranslation({ version });
    useToast().add({ title: '中文导入完成', description: `${formatDate(version)}，共 ${result.totalNodes} 个条目。`, color: 'success' });
  } catch (error) {
    importError.value = `${formatDate(version)} 中文导入失败：${errorMessage(error)}`;
    useToast().add({ title: '中文导入失败', description: importError.value, color: 'error' });
  } finally {
    await refreshVersions();
    importingTranslation.value = null;
  }
}
</script>
