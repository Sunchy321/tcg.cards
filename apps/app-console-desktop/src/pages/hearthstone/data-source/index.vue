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
            desktop 端负责本地 hsdata git repo 的配置与来源浏览；真正的 XML 导入仍通过远端 worker-safe 接口完成。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
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
          <div class="font-medium">本地 repo 配置</div>
          <p class="mt-1 text-xs text-muted">
            请输入本机 hsdata 仓库根目录。保存时会校验 git repo 与 `CardDefs.xml` 是否存在。
          </p>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex flex-col gap-3 lg:flex-row">
          <UInput
            v-model="repoPathInput"
            class="flex-1"
            placeholder="/absolute/path/to/hsdata"
          />
          <div class="flex flex-wrap gap-2">
            <UButton
              label="保存"
              icon="i-lucide-save"
              :loading="savingRepoPath"
              @click="saveRepoPath"
            />
            <UButton
              label="清空"
              icon="i-lucide-eraser"
              color="neutral"
              variant="ghost"
              :disabled="savingRepoPath || repoPathInput.trim().length === 0"
              @click="clearRepoPath"
            />
          </div>
        </div>

        <UAlert
          v-if="repoPathError"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :description="repoPathError"
        />

        <div v-if="state?.repoPath" class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <UCard class="bg-elevated">
            <div class="text-xs text-muted">当前 build</div>
            <div class="mt-1 text-lg font-semibold">{{ state.tag ?? '-' }}</div>
          </UCard>
          <UCard class="bg-elevated">
            <div class="text-xs text-muted">HEAD</div>
            <div class="mt-1 text-lg font-mono">{{ state.short ?? '-' }}</div>
          </UCard>
          <UCard class="bg-elevated">
            <div class="text-xs text-muted">工作树状态</div>
            <div class="mt-1 text-sm">{{ state.dirty ? 'dirty' : 'clean' }}</div>
          </UCard>
          <UCard class="bg-elevated">
            <div class="text-xs text-muted">可导入来源</div>
            <div class="mt-1 text-lg font-semibold">{{ state.fileCount ?? files.length }}</div>
          </UCard>
        </div>

        <UAlert
          v-else
          color="warning"
          variant="soft"
          icon="i-lucide-folder-search"
          description="尚未配置 hsdata 本地仓库路径。"
        />

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
            <div class="font-medium">本地来源列表</div>
            <p class="mt-1 text-xs text-muted">
              展示当前 worktree 与包含 `CardDefs.xml` 的 git tag。
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
          配置本地仓库后即可查看来源列表
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
                <UBadge :label="file.kind" size="xs" color="neutral" variant="soft" />
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
import {
  formatHsdataBytes,
  formatHsdataDate,
  getHsdataErrorMessage,
  getHsdataRepoPath,
  getHsdataRepoState,
  listHsdataSources,
  setHsdataRepoPath,
} from '~/composables/useHsdataRepo';
import type {
  HsdataFile,
  HsdataSourceState,
} from '~/composables/useHsdataRepo';

definePageMeta({
  title: '数据源',
});

const router = useRouter();

const repoPathInput = ref('');
const savingRepoPath = ref(false);
const repoPathError = ref('');
const state = ref<HsdataSourceState | null>(null);
const files = ref<HsdataFile[]>([]);
const stateError = ref('');
const filesError = ref('');
const loadingState = ref(false);
const loadingFiles = ref(false);

function openImport(sourceId?: string) {
  void router.push({
    path:  '/hearthstone/data-import',
    query: sourceId ? { source: sourceId } : undefined,
  });
}

async function loadRepoPath() {
  repoPathInput.value = (await getHsdataRepoPath()) ?? '';
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
  await loadRepoPath();
  await loadState();
  await loadFiles();
}

async function saveRepoPath() {
  savingRepoPath.value = true;
  repoPathError.value = '';

  try {
    const resolved = await setHsdataRepoPath(repoPathInput.value.trim().length > 0 ? repoPathInput.value : null);
    repoPathInput.value = resolved ?? '';
    await loadState();
    await loadFiles();
  } catch (error) {
    console.error('Failed to save hsdata repo path:', error);
    repoPathError.value = getHsdataErrorMessage(error);
  } finally {
    savingRepoPath.value = false;
  }
}

async function clearRepoPath() {
  repoPathInput.value = '';
  await saveRepoPath();
}

onMounted(() => {
  void reloadAll();
});
</script>
