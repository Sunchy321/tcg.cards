<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div>
        <h1 class="desktop-section-title">
          Hearthstone 设置
        </h1>
        <p class="mt-2 text-sm text-muted">
          配置炉石数据源路径，供数据源管理和导入流程使用。
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <UCard>
          <template #header>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div class="font-medium">hsdata 配置</div>
                <div class="mt-1 text-xs text-muted">配置本地 hsdata 仓库路径。</div>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  label="查看数据源"
                  icon="i-lucide-database"
                  color="neutral"
                  variant="ghost"
                  to="/hearthstone/data-source"
                />
                <UButton
                  label="打开导入"
                  icon="i-lucide-download"
                  color="neutral"
                  variant="ghost"
                  to="/hearthstone/data-import"
                />
              </div>
            </div>
          </template>

          <div class="space-y-4">
            <div>
              <div class="text-sm font-medium text-default">hsdata 数据源路径</div>
              <div class="mt-1 text-xs text-muted">
                通过目录选择框选择 hsdata 数据源目录。选择后会自动校验并保存。
              </div>
            </div>

            <DirectoryPickerField
              :value="hsdataRepoPathInput"
              placeholder="/absolute/path/to/hsdata"
              :loading="loadingHsdataRepoPath || pickingHsdataRepoPath"
              :pick-loading="pickingHsdataRepoPath"
              :pick-disabled="loadingHsdataRepoPath || savingHsdataRepoPath"
              :clear-disabled="savingHsdataRepoPath || pickingHsdataRepoPath || hsdataRepoPathInput.trim().length === 0"
              @pick="pickHsdataRepoPath"
              @clear="clearHsdataRepoPath"
            />

            <UAlert
              v-if="hsdataRepoPathError.length > 0"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :description="hsdataRepoPathError"
            />
            <UAlert
              v-else-if="savedHsdataRepoPath"
              color="success"
              variant="soft"
              icon="i-lucide-circle-check-big"
              :description="`当前已配置仓库：${savedHsdataRepoPath}`"
            />
            <UAlert
              v-else
              color="warning"
              variant="soft"
              icon="i-lucide-folder-search"
              description="尚未配置 hsdata 数据源路径。"
            />
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import {
  getDesktopGameRepo,
  pickDesktopDirectory,
  setDesktopGameRepo,
} from '~/composables/useDesktopSettings';

definePageMeta({
  layout: 'admin',
  title:  'Hearthstone 设置',
});

const hsdataRepoPathInput = ref('');
const savedHsdataRepoPath = ref<string | null>(null);
const loadingHsdataRepoPath = ref(false);
const pickingHsdataRepoPath = ref(false);
const savingHsdataRepoPath = ref(false);
const hsdataRepoPathError = ref('');

/** Loads the configured hsdata repository path. */
async function loadHearthstoneSettings() {
  loadingHsdataRepoPath.value = true;
  hsdataRepoPathError.value = '';

  try {
    const repoPath = await getDesktopGameRepo('hearthstone', 'hsdata');
    savedHsdataRepoPath.value = repoPath;
    hsdataRepoPathInput.value = repoPath ?? '';
  } catch (error) {
    console.error('Failed to load desktop Hearthstone settings:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '设置读取失败');
  } finally {
    loadingHsdataRepoPath.value = false;
  }
}

/** Persists the hsdata repository path. */
async function saveHsdataRepoPath(nextPath?: string | null) {
  savingHsdataRepoPath.value = true;
  hsdataRepoPathError.value = '';

  try {
    const repoPathInput = (nextPath ?? hsdataRepoPathInput.value).trim();
    const repoPath = await setDesktopGameRepo(
      'hearthstone',
      'hsdata',
      repoPathInput.length > 0 ? repoPathInput : null,
    );

    savedHsdataRepoPath.value = repoPath;
    hsdataRepoPathInput.value = repoPath ?? '';
  } catch (error) {
    console.error('Failed to save desktop Hearthstone settings:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '设置保存失败');
    hsdataRepoPathInput.value = savedHsdataRepoPath.value ?? '';
  } finally {
    savingHsdataRepoPath.value = false;
  }
}

/** Clears the configured hsdata repository path. */
async function clearHsdataRepoPath() {
  await saveHsdataRepoPath('');
}

/** Opens a directory picker for the hsdata repository path. */
async function pickHsdataRepoPath() {
  pickingHsdataRepoPath.value = true;
  hsdataRepoPathError.value = '';

  try {
    const directoryInput = hsdataRepoPathInput.value.trim();
    const directory = await pickDesktopDirectory(directoryInput.length > 0 ? directoryInput : null);

    if (directory) {
      await saveHsdataRepoPath(directory);
    }
  } catch (error) {
    console.error('Failed to pick desktop Hearthstone repo path:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '目录选择失败');
  } finally {
    pickingHsdataRepoPath.value = false;
  }
}

onMounted(() => {
  void loadHearthstoneSettings();
});
</script>
