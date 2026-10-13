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
            从威世智官网获取最新版本的万智牌完整规则文件,同时保存到本地与云端。
          </p>
        </div>
        <div class="ml-auto flex gap-2">
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="soft"
            :loading="loadingVersions"
            @click="refreshVersions"
          />
          <UButton
            label="下载最新规则"
            icon="i-lucide-download"
            :loading="downloading"
            @click="downloadLatest"
          />
        </div>
      </div>
      <p v-if="listWarning" class="mt-2 text-sm text-warning">
        {{ listWarning }}
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

interface FileFlags {
  txt: boolean;
  doc: boolean;
  pdf: boolean;
}

interface VersionRow {
  date:  string;
  local: FileFlags;
  cloud: FileFlags;
}

const fileFormats = ['txt', 'doc', 'pdf'] as const;

function emptyFlags(): FileFlags {
  return { txt: false, doc: false, pdf: false };
}

function presentFormats(flags: FileFlags) {
  return fileFormats.filter(format => flags[format]);
}

function hasFiles(flags: FileFlags) {
  return presentFormats(flags).length > 0;
}

function formatDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return value.length === 8
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function mergeVersions(
  local: Awaited<ReturnType<typeof orpc.magic.rule.listLocal>>,
  cloud: Awaited<ReturnType<typeof remote.magic.rule.listFiles>>,
): VersionRow[] {
  const rows = new Map<string, VersionRow>();

  for (const version of cloud) {
    rows.set(version.id, {
      date:  version.id,
      local: emptyFlags(),
      cloud: { ...version.files },
    });
  }

  for (const version of local) {
    const row = rows.get(version.date) ?? {
      date:  version.date,
      local: emptyFlags(),
      cloud: emptyFlags(),
    };
    row.local = { ...version.files };
    rows.set(version.date, row);
  }

  return [...rows.values()].sort((a, b) => b.date.localeCompare(a.date));
}

const rows = ref<VersionRow[]>([]);
const loadingVersions = ref(false);
const listWarning = ref<string | null>(null);

async function refreshVersions() {
  loadingVersions.value = true;
  try {
    const [local, cloud] = await Promise.allSettled([
      orpc.magic.rule.listLocal(),
      remote.magic.rule.listFiles(),
    ]);

    const warnings = [
      ...(local.status === 'rejected' ? [`本地版本读取失败:${errorMessage(local.reason)}`] : []),
      ...(cloud.status === 'rejected' ? [`云端版本获取失败:${errorMessage(cloud.reason)}`] : []),
    ];
    listWarning.value = warnings.length > 0 ? warnings.join(' ') : null;

    rows.value = mergeVersions(
      local.status === 'fulfilled' ? local.value : [],
      cloud.status === 'fulfilled' ? cloud.value : [],
    );
  } finally {
    loadingVersions.value = false;
  }
}

onMounted(() => {
  void refreshVersions();
});

const downloading = ref(false);

async function downloadLatest() {
  downloading.value = true;
  try {
    const [cloud, local] = await Promise.allSettled([
      remote.magic.rule.syncLatest(),
      orpc.magic.rule.downloadLatest(),
    ]);

    const toast = useToast();
    const failures = [
      ...(cloud.status === 'rejected' ? [`云端下载失败:${errorMessage(cloud.reason)}`] : []),
      ...(local.status === 'rejected' ? [`本地下载失败:${errorMessage(local.reason)}`] : []),
    ];

    if (failures.length === 2) {
      toast.add({ title: '下载失败', description: failures.join(' '), color: 'error' });
    } else if (failures.length === 1) {
      toast.add({ title: '部分失败', description: failures.join(' '), color: 'warning' });
    } else if (cloud.status === 'fulfilled' && local.status === 'fulfilled') {
      if (cloud.value.sourceId !== local.value.version) {
        toast.add({
          title:       '两端版本不一致',
          description: `云端为 ${formatDate(cloud.value.sourceId)},本地为 ${formatDate(local.value.version)},可重试下载。`,
          color:       'warning',
        });
      } else if (!cloud.value.downloaded && !local.value.downloaded) {
        toast.add({ title: '已是最新', description: `最新版本 ${formatDate(local.value.version)} 已保存在本地与云端。`, color: 'info' });
      } else {
        toast.add({ title: '已下载最新规则', description: `版本 ${formatDate(local.value.version)} 已保存在本地与云端。`, color: 'success' });
      }
    }

    await refreshVersions();
  } finally {
    downloading.value = false;
  }
}
</script>
