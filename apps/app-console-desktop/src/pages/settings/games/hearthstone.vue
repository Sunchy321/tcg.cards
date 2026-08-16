<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            Hearthstone 设置
          </h1>
          <p class="mt-2 text-sm text-muted">
            配置炉石数据源路径，供数据源管理和导入流程使用。
          </p>
        </div>

        <DesktopConfigHeaderActions />
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <div class="space-y-6">
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

          <UCard>
            <template #header>
              <div>
                <div class="font-medium">Image</div>
                <div class="mt-1 text-xs text-muted">配置本地渲染端地址和本地图片 bucket 根目录。</div>
              </div>
            </template>

            <div class="space-y-4">
              <div class="space-y-2">
                <label for="image-renderer-base-url" class="text-sm font-medium text-default">Renderer Base URL</label>
                <input
                  id="image-renderer-base-url"
                  v-model="imageRendererBaseUrlInput"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default"
                  :placeholder="defaultRendererBaseUrl"
                  :disabled="loadingImageSettings || savingImageSettings || pickingImageBucketDir"
                >
              </div>

              <div>
                <div class="text-sm font-medium text-default">Bucket Directory</div>
                <div class="mt-1 text-xs text-muted">
                  选择本地图片 bucket 根目录，渲染后的图片会按类 R2 路径写入该目录。
                </div>
              </div>

              <DirectoryPickerField
                :value="imageBucketDirInput"
                placeholder="/absolute/path/to/asset-bucket"
                :loading="loadingImageSettings || pickingImageBucketDir"
                :pick-loading="pickingImageBucketDir"
                :pick-disabled="loadingImageSettings || savingImageSettings"
                :clear-disabled="savingImageSettings || pickingImageBucketDir || imageBucketDirInput.trim().length === 0"
                @pick="pickImageBucketDir"
                @clear="clearImageBucketDir"
              />

              <div class="flex flex-wrap gap-2">
                <UButton
                  label="保存 Image 配置"
                  icon="i-lucide-save"
                  color="primary"
                  :loading="savingImageSettings"
                  :disabled="loadingImageSettings || pickingImageBucketDir"
                  @click="saveImageSettings()"
                />
                <UButton
                  label="清空配置"
                  icon="i-lucide-trash"
                  color="error"
                  variant="soft"
                  :disabled="loadingImageSettings || savingImageSettings || pickingImageBucketDir"
                  @click="clearImageSettings"
                />
                <UButton
                  label="测试连接"
                  icon="i-lucide-plug"
                  color="neutral"
                  variant="soft"
                  :loading="testingImageRenderer"
                  :disabled="loadingImageSettings || savingImageSettings || pickingImageBucketDir"
                  @click="testImageRenderer"
                />
              </div>

              <UAlert
                v-if="imageRendererTestError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-plug-zap"
                :description="imageRendererTestError"
              />
              <UAlert
                v-else-if="imageRendererTestResult"
                :color="imageRendererTestOk ? 'success' : 'warning'"
                variant="soft"
                :icon="imageRendererTestOk ? 'i-lucide-badge-check' : 'i-lucide-triangle-alert'"
              >
                <template #description>
                  <div>
                    <div>{{ imageRendererTestOk ? '渲染端就绪' : '渲染端可达但未就绪' }}</div>
                    <div class="mt-1 text-xs">
                      service={{ imageRendererTestResult.service }},
                      version={{ imageRendererTestResult.version }},
                      protocol={{ imageRendererTestResult.protocolVersion }},
                      requestShape={{ imageRendererTestResult.requestShape }},
                      format={{ imageRendererTestResult.outputFormat }},
                      ready={{ imageRendererTestResult.ready }}
                      <span v-if="imageRendererTestResult.message">
                        , message={{ imageRendererTestResult.message }}
                      </span>
                    </div>
                  </div>
                </template>
              </UAlert>

              <UAlert
                v-if="imageSettingsError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="imageSettingsError"
              />
              <UAlert
                v-else-if="savedImageRendererBaseUrl || savedImageBucketDir"
                color="success"
                variant="soft"
                icon="i-lucide-circle-check-big"
                :description="`当前已保存配置：renderer=${savedImageRendererBaseUrl ?? '-'}，bucket=${savedImageBucketDir ?? '-'}`"
              />
              <UAlert
                v-else
                color="warning"
                variant="soft"
                icon="i-lucide-image-off"
                description="尚未配置本地图片渲染端或 bucket 根目录。"
              />
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import {
  getDesktopHearthstoneImageSettings,
  getDesktopGameRepo,
  pickDesktopDirectory,
  setDesktopHearthstoneImageSettings,
  setDesktopGameRepo,
} from '~/composables/useDesktopSettings';
import { detectDesktopHearthstoneImageRenderer } from '~/composables/useDesktopRuntimeClient';

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

const defaultRendererBaseUrl = 'http://localhost:58437';
const imageRendererBaseUrlInput = ref('');
const imageBucketDirInput = ref('');
const savedImageRendererBaseUrl = ref<string | null>(null);
const savedImageBucketDir = ref<string | null>(null);
const loadingImageSettings = ref(false);
const savingImageSettings = ref(false);
const pickingImageBucketDir = ref(false);
const imageSettingsError = ref('');
const testingImageRenderer = ref(false);
const imageRendererTestError = ref('');
const imageRendererTestResult = ref<{
  service: string;
  version: string;
  protocolVersion: string;
  requestShape: string;
  outputFormat: string;
  ready: boolean;
  message?: string | null;
} | null>(null);
const imageRendererTestOk = ref(false);

/** Loads the configured hsdata repository path. */
async function loadHearthstoneSettings() {
  loadingHsdataRepoPath.value = true;
  loadingImageSettings.value = true;
  hsdataRepoPathError.value = '';
  imageSettingsError.value = '';

  try {
    const repoPath = await getDesktopGameRepo('hearthstone', 'hsdata');
    const imageSettings = await getDesktopHearthstoneImageSettings();

    savedHsdataRepoPath.value = repoPath;
    hsdataRepoPathInput.value = repoPath ?? '';
    savedImageRendererBaseUrl.value = imageSettings.rendererBaseUrl ?? null;
    savedImageBucketDir.value = imageSettings.bucketDir ?? null;
    imageRendererBaseUrlInput.value = imageSettings.rendererBaseUrl ?? '';
    imageBucketDirInput.value = imageSettings.bucketDir ?? '';
  } catch (error) {
    console.error('Failed to load desktop Hearthstone settings:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '设置读取失败');
    imageSettingsError.value = getConsoleErrorMessage(error, '设置读取失败');
  } finally {
    loadingHsdataRepoPath.value = false;
    loadingImageSettings.value = false;
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

/** Persists the Hearthstone image settings. */
async function saveImageSettings(nextBucketDir?: string | null) {
  savingImageSettings.value = true;
  imageSettingsError.value = '';

  try {
    const settings = await setDesktopHearthstoneImageSettings(
      imageRendererBaseUrlInput.value.trim().length > 0 ? imageRendererBaseUrlInput.value.trim() : null,
      (nextBucketDir ?? imageBucketDirInput.value).trim().length > 0
        ? (nextBucketDir ?? imageBucketDirInput.value).trim()
        : null,
    );

    savedImageRendererBaseUrl.value = settings.rendererBaseUrl ?? null;
    savedImageBucketDir.value = settings.bucketDir ?? null;
    imageRendererBaseUrlInput.value = settings.rendererBaseUrl ?? '';
    imageBucketDirInput.value = settings.bucketDir ?? '';
  } catch (error) {
    console.error('Failed to save Hearthstone image settings:', error);
    imageSettingsError.value = getConsoleErrorMessage(error, 'Image 配置保存失败');
    imageRendererBaseUrlInput.value = savedImageRendererBaseUrl.value ?? '';
    imageBucketDirInput.value = savedImageBucketDir.value ?? '';
  } finally {
    savingImageSettings.value = false;
  }
}

/** Clears the configured Hearthstone image settings. */
async function clearImageSettings() {
  savingImageSettings.value = true;
  imageSettingsError.value = '';

  try {
    const settings = await setDesktopHearthstoneImageSettings(null, null);

    savedImageRendererBaseUrl.value = settings.rendererBaseUrl ?? null;
    savedImageBucketDir.value = settings.bucketDir ?? null;
    imageRendererBaseUrlInput.value = settings.rendererBaseUrl ?? '';
    imageBucketDirInput.value = settings.bucketDir ?? '';
  } catch (error) {
    console.error('Failed to clear Hearthstone image settings:', error);
    imageSettingsError.value = getConsoleErrorMessage(error, 'Image 配置清理失败');
  } finally {
    savingImageSettings.value = false;
  }
}

/** Opens a directory picker for the local image bucket path. */
async function pickImageBucketDir() {
  pickingImageBucketDir.value = true;
  imageSettingsError.value = '';

  try {
    const directoryInput = imageBucketDirInput.value.trim();
    const directory = await pickDesktopDirectory(directoryInput.length > 0 ? directoryInput : null);

    if (directory) {
      await saveImageSettings(directory);
    }
  } catch (error) {
    console.error('Failed to pick desktop Hearthstone image bucket directory:', error);
    imageSettingsError.value = getConsoleErrorMessage(error, '目录选择失败');
  } finally {
    pickingImageBucketDir.value = false;
  }
}

/** Clears the configured local image bucket path while preserving the renderer URL input. */
async function clearImageBucketDir() {
  imageBucketDirInput.value = '';
}

/** Tests the connection to the Hearthstone image renderer using the current text field value. */
async function testImageRenderer() {
  testingImageRenderer.value = true;
  imageRendererTestError.value = '';
  imageRendererTestResult.value = null;
  imageRendererTestOk.value = false;

  try {
    const url = imageRendererBaseUrlInput.value.trim();
    const result = await detectDesktopHearthstoneImageRenderer(url.length > 0 ? url : defaultRendererBaseUrl);

    if (!result.reachable || result.status == null) {
      imageRendererTestError.value = result.error ?? '无法连接到渲染端服务。';
      return;
    }

    imageRendererTestResult.value = result.status;
    imageRendererTestOk.value = result.status.ready;
  } catch (error) {
    console.error('Failed to test Hearthstone image renderer:', error);
    imageRendererTestError.value = getConsoleErrorMessage(error, '渲染端连接测试失败');
  } finally {
    testingImageRenderer.value = false;
  }
}

onMounted(() => {
  void loadHearthstoneSettings();
});

watch([
  imageRendererBaseUrlInput,
  imageBucketDirInput,
], () => {
  imageSettingsError.value = '';
  imageRendererTestError.value = '';
  imageRendererTestResult.value = null;
  imageRendererTestOk.value = false;
});
</script>
