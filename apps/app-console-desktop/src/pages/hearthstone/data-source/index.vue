<template>
  <div class="space-y-6">
    <UCard>
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-database" class="size-5 text-primary" />
            <h1 class="text-xl font-semibold">hsdata 数据源</h1>
          </div>
          <p class="mt-1 text-sm text-muted">
            查看 hsdata 数据源路径与可用版本。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="同步远端版本"
            icon="i-lucide-cloud-sync"
            color="primary"
            variant="soft"
            :loading="syncing"
            :disabled="!state?.repoPath || loadingState || loadingFiles"
            @click="syncRemoteVersions"
          />
          <UButton
            label="打开数据导入"
            icon="i-lucide-download"
            @click="openImport()"
          />
          <UButton
            label="刷新"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loadingState || loadingFiles"
            @click="reloadAll"
          />
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <div class="font-medium">仓库配置</div>
          <p class="mt-1 text-xs text-muted">
            查看当前已配置的数据源路径。
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <UAlert
          v-if="!state?.repoPath"
          color="warning"
          variant="soft"
          icon="i-lucide-folder-search"
          :ui="{ icon: 'sm:self-center' }"
        >
          <template #description>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>尚未配置 hsdata 数据源路径，请先前往设置页完成设置。</span>
              <div class="sm:ml-auto">
                <UButton
                  label="打开设置"
                  icon="i-lucide-settings"
                  color="warning"
                  variant="soft"
                  @click="openSettings"
                />
              </div>
            </div>
          </template>
        </UAlert>

        <div v-if="state?.repoPath" class="rounded-lg border border-default p-3">
          <div class="text-xs text-muted">当前仓库</div>
          <div class="mt-1 break-all font-mono text-sm">{{ state.repoPath }}</div>
        </div>

        <UAlert
          v-if="stateError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="stateError"
        />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-medium">可用来源列表</div>
            <p class="mt-1 text-xs text-muted">
              展示当前可同步并可导入的数据版本。
            </p>
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="loadingFiles"
            :disabled="!state?.repoPath"
            @click="loadFiles"
          />
        </div>
      </template>

      <div v-if="loadingFiles && files.length === 0" class="flex justify-center py-8">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>
      <div v-else class="space-y-4">
        <UAlert
          v-if="filesError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="filesError"
        />

        <div v-if="!state?.repoPath && !filesError" class="py-8 text-center text-sm text-muted">
          请先在设置页完成 hsdata 数据源配置
        </div>
        <div v-else-if="files.length === 0 && !filesError" class="py-8 text-center text-sm text-muted">
          暂无可导入来源
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="file in files"
            :key="file.id"
            class="flex flex-col gap-3 rounded-lg border border-default p-3 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-sm">{{ file.name }}</span>
                <UBadge
                  v-if="file.sourceTag != null"
                  :label="String(file.sourceTag)"
                  size="xs"
                  color="primary"
                  variant="soft"
                />
              </div>
              <div class="mt-1 flex flex-wrap gap-3 text-xs text-muted">
                <span>{{ file.shortCommit }}</span>
                <span>{{ formatHsdataBytes(file.size) }}</span>
                <span v-if="file.time">{{ formatHsdataDate(file.time) }}</span>
              </div>
            </div>

            <UButton
              label="前往导入"
              icon="i-lucide-arrow-right"
              color="neutral"
              variant="soft"
              @click="openImport(file.id)"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import {
  formatHsdataBytes,
  formatHsdataDate,
  getHsdataErrorMessage,
  getHsdataRepoState,
  listHsdataSources,
  syncHsdataRemoteVersions,
} from '~/composables/useHsdataRepo';
import type {
  HsdataFile,
  HsdataRepoState,
} from '~/composables/useHsdataRepo';

definePageMeta({
  layout: 'admin',
  title:  '数据源',
});

const router = useRouter();

const state = ref<HsdataRepoState | null>(null);
const files = ref<HsdataFile[]>([]);
const stateError = ref('');
const filesError = ref('');
const loadingState = ref(false);
const loadingFiles = ref(false);
const syncing = ref(false);
const toast = useToast();

function openImport(sourceId?: string) {
  void router.push({
    path:  '/hearthstone/data-import',
    query: sourceId ? { source: sourceId } : undefined,
  });
}

function openSettings() {
  void router.push({
    path: '/settings/games/hearthstone',
  });
}

async function loadState() {
  loadingState.value = true;
  stateError.value = '';

  try {
    state.value = await getHsdataRepoState();
  } catch (error) {
    console.error('Failed to load hsdata repo state:', error);
    stateError.value = getHsdataErrorMessage(error);
    state.value = null;
  } finally {
    loadingState.value = false;
  }
}

async function loadFiles() {
  if (!state.value?.repoPath) {
    files.value = [];
    filesError.value = '';
    return;
  }

  loadingFiles.value = true;
  filesError.value = '';

  try {
    files.value = await listHsdataSources();
  } catch (error) {
    console.error('Failed to list hsdata sources:', error);
    filesError.value = getHsdataErrorMessage(error);
    files.value = [];
  } finally {
    loadingFiles.value = false;
  }
}

async function reloadAll() {
  await loadState();
  await loadFiles();
}

async function syncRemoteVersions() {
  syncing.value = true;
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  try {
    const result = await syncHsdataRemoteVersions();
    await reloadAll();
    toast.add({
      title:       '已完成远端版本同步',
      description: `${result.remote} -> ${result.repoPath}`,
      color:       'success',
    });
  } catch (error) {
    console.error('Failed to sync hsdata remote versions:', error);
    toast.add({
      title:       '同步远端版本失败',
      description: getHsdataErrorMessage(error),
      color:       'error',
    });
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  void reloadAll();
});
</script>
