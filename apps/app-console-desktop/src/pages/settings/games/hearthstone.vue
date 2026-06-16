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
                <div class="font-medium">Publish Target</div>
                <div class="mt-1 text-xs text-muted">配置远端发布目标，并固定批次绑定所需的目标身份。</div>
              </div>
            </template>

            <div class="space-y-4">
              <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                  <label for="publish-target-id" class="text-sm font-medium text-default">Target ID</label>
                  <input
                    id="publish-target-id"
                    v-model="publishTargetInput"
                    class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default"
                    placeholder="hearthstone-remote-dev"
                    :disabled="loadingPublishTarget || savingPublishTarget || testingPublishTarget || validatingPublishTarget"
                  >
                </div>

                <div class="space-y-2">
                  <label for="publish-target-environment" class="text-sm font-medium text-default">Environment</label>
                  <input
                    id="publish-target-environment"
                    v-model="publishTargetEnvironmentInput"
                    class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default"
                    placeholder="dev"
                    :disabled="loadingPublishTarget || savingPublishTarget || testingPublishTarget || validatingPublishTarget"
                  >
                </div>
              </div>

              <div class="space-y-2">
                <label for="publish-target-connection" class="text-sm font-medium text-default">Connection String</label>
                <input
                  id="publish-target-connection"
                  v-model="publishTargetConnectionStringInput"
                  class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default"
                  placeholder="postgres://user:password@127.0.0.1:5432/tcg_cards_remote_dev"
                  :disabled="loadingPublishTarget || savingPublishTarget || testingPublishTarget || validatingPublishTarget"
                >
              </div>

              <div class="flex flex-wrap gap-2">
                <UButton
                  label="保存 Publish Target"
                  icon="i-lucide-save"
                  color="primary"
                  :loading="savingPublishTarget"
                  :disabled="loadingPublishTarget || testingPublishTarget || validatingPublishTarget"
                  @click="savePublishTarget"
                />
                <UButton
                  label="测试目标"
                  icon="i-lucide-plug"
                  color="neutral"
                  variant="soft"
                  :loading="testingPublishTarget"
                  :disabled="loadingPublishTarget || savingPublishTarget || validatingPublishTarget"
                  @click="testPublishTarget"
                />
                <UButton
                  label="校验绑定"
                  icon="i-lucide-shield-check"
                  color="neutral"
                  variant="soft"
                  :loading="validatingPublishTarget"
                  :disabled="loadingPublishTarget || savingPublishTarget || testingPublishTarget || !savedPublishTargetFingerprint"
                  @click="validatePublishTargetBinding"
                />
                <UButton
                  label="清空目标"
                  icon="i-lucide-trash"
                  color="error"
                  variant="soft"
                  :disabled="loadingPublishTarget || savingPublishTarget || testingPublishTarget || validatingPublishTarget"
                  @click="clearPublishTarget"
                />
              </div>

              <UAlert
                v-if="publishTargetError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="publishTargetError"
              />
              <UAlert
                v-else-if="savedPublishTargetFingerprint"
                color="success"
                variant="soft"
                icon="i-lucide-circle-check-big"
                :description="`当前已保存目标：${savedPublishTarget ?? '-'} / ${savedPublishTargetEnvironment ?? '-'} / fingerprint=${savedPublishTargetFingerprint}`"
              />
              <UAlert
                v-else
                color="warning"
                variant="soft"
                icon="i-lucide-plug-zap"
                description="尚未配置远端 publish target。"
              />

              <UAlert
                v-if="publishTargetTestError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-plug-zap"
                :description="publishTargetTestError"
              />
              <UAlert
                v-else-if="publishTargetTestResult"
                color="success"
                variant="soft"
                icon="i-lucide-badge-check"
                :description="`连接成功：target=${publishTargetTestResult.publishTarget}，env=${publishTargetTestResult.environment}，database=${publishTargetTestResult.databaseName}，user=${publishTargetTestResult.userName}，host=${publishTargetTestResult.serverHost}:${publishTargetTestResult.serverPort}，latency=${publishTargetTestResult.latencyMs}ms，fingerprint=${publishTargetTestResult.targetFingerprint}`"
              />

              <UAlert
                v-if="publishTargetValidationError.length > 0"
                color="error"
                variant="soft"
                icon="i-lucide-shield-x"
                :description="publishTargetValidationError"
              />
              <UAlert
                v-else-if="publishTargetValidationMessage.length > 0"
                :color="publishTargetValidationOk ? 'success' : 'warning'"
                variant="soft"
                :icon="publishTargetValidationOk ? 'i-lucide-shield-check' : 'i-lucide-shield-alert'"
                :description="publishTargetValidationMessage"
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
  getDesktopHearthstonePublishTarget,
  getDesktopGameRepo,
  pickDesktopDirectory,
  setDesktopHearthstoneImageSettings,
  setDesktopHearthstonePublishTarget,
  setDesktopGameRepo,
  testDesktopHearthstonePublishTarget,
  validateDesktopHearthstonePublishTargetBinding,
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
const publishTargetInput = ref('');
const publishTargetEnvironmentInput = ref('');
const publishTargetConnectionStringInput = ref('');
const savedPublishTarget = ref<string | null>(null);
const savedPublishTargetEnvironment = ref<string | null>(null);
const savedPublishTargetFingerprint = ref<string | null>(null);
const loadingPublishTarget = ref(false);
const savingPublishTarget = ref(false);
const testingPublishTarget = ref(false);
const validatingPublishTarget = ref(false);
const publishTargetError = ref('');
const publishTargetTestError = ref('');
const publishTargetValidationError = ref('');
const publishTargetValidationMessage = ref('');
const publishTargetValidationOk = ref(false);
const publishTargetTestResult = ref<{
  publishTarget:   string;
  environment:       string;
  targetFingerprint: string;
  databaseName:      string;
  userName:          string;
  serverHost:        string;
  serverPort:        number;
  latencyMs:         number;
} | null>(null);

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
  loadingPublishTarget.value = true;
  loadingImageSettings.value = true;
  hsdataRepoPathError.value = '';
  publishTargetError.value = '';
  imageSettingsError.value = '';

  try {
    const repoPath = await getDesktopGameRepo('hearthstone', 'hsdata');
    const publishTarget = await getDesktopHearthstonePublishTarget();
    const imageSettings = await getDesktopHearthstoneImageSettings();

    savedHsdataRepoPath.value = repoPath;
    hsdataRepoPathInput.value = repoPath ?? '';
    savedPublishTarget.value = publishTarget.publishTarget ?? null;
    savedPublishTargetEnvironment.value = publishTarget.environment ?? null;
    savedPublishTargetFingerprint.value = publishTarget.targetFingerprint ?? null;
    publishTargetInput.value = publishTarget.publishTarget ?? '';
    publishTargetEnvironmentInput.value = publishTarget.environment ?? '';
    publishTargetConnectionStringInput.value = publishTarget.connectionString ?? '';
    savedImageRendererBaseUrl.value = imageSettings.rendererBaseUrl ?? null;
    savedImageBucketDir.value = imageSettings.bucketDir ?? null;
    imageRendererBaseUrlInput.value = imageSettings.rendererBaseUrl ?? '';
    imageBucketDirInput.value = imageSettings.bucketDir ?? '';
  } catch (error) {
    console.error('Failed to load desktop Hearthstone settings:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '设置读取失败');
    publishTargetError.value = getConsoleErrorMessage(error, '设置读取失败');
    imageSettingsError.value = getConsoleErrorMessage(error, '设置读取失败');
  } finally {
    loadingHsdataRepoPath.value = false;
    loadingPublishTarget.value = false;
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

/** Persists the Hearthstone publish target settings. */
async function savePublishTarget() {
  savingPublishTarget.value = true;
  publishTargetError.value = '';

  try {
    const settings = await setDesktopHearthstonePublishTarget(
      publishTargetInput.value.trim().length > 0 ? publishTargetInput.value.trim() : null,
      publishTargetEnvironmentInput.value.trim().length > 0 ? publishTargetEnvironmentInput.value.trim() : null,
      publishTargetConnectionStringInput.value.trim().length > 0 ? publishTargetConnectionStringInput.value.trim() : null,
    );

    savedPublishTarget.value = settings.publishTarget ?? null;
    savedPublishTargetEnvironment.value = settings.environment ?? null;
    savedPublishTargetFingerprint.value = settings.targetFingerprint ?? null;
    publishTargetInput.value = settings.publishTarget ?? '';
    publishTargetEnvironmentInput.value = settings.environment ?? '';
    publishTargetConnectionStringInput.value = settings.connectionString ?? '';
    publishTargetValidationMessage.value = '';
  } catch (error) {
    console.error('Failed to save Hearthstone publish target settings:', error);
    publishTargetError.value = getConsoleErrorMessage(error, 'Publish target 保存失败');
  } finally {
    savingPublishTarget.value = false;
  }
}

/** Clears the configured Hearthstone publish target settings. */
async function clearPublishTarget() {
  savingPublishTarget.value = true;
  publishTargetError.value = '';

  try {
    const settings = await setDesktopHearthstonePublishTarget(null, null, null);

    savedPublishTarget.value = settings.publishTarget ?? null;
    savedPublishTargetEnvironment.value = settings.environment ?? null;
    savedPublishTargetFingerprint.value = settings.targetFingerprint ?? null;
    publishTargetInput.value = settings.publishTarget ?? '';
    publishTargetEnvironmentInput.value = settings.environment ?? '';
    publishTargetConnectionStringInput.value = settings.connectionString ?? '';
    publishTargetValidationMessage.value = '';
  } catch (error) {
    console.error('Failed to clear Hearthstone publish target settings:', error);
    publishTargetError.value = getConsoleErrorMessage(error, 'Publish target 清理失败');
  } finally {
    savingPublishTarget.value = false;
  }
}

/** Tests the current Hearthstone publish target without persisting it. */
async function testPublishTarget() {
  testingPublishTarget.value = true;
  publishTargetTestError.value = '';
  publishTargetTestResult.value = null;

  try {
    const result = await testDesktopHearthstonePublishTarget(
      publishTargetInput.value.trim().length > 0 ? publishTargetInput.value.trim() : null,
      publishTargetEnvironmentInput.value.trim().length > 0 ? publishTargetEnvironmentInput.value.trim() : null,
      publishTargetConnectionStringInput.value.trim().length > 0 ? publishTargetConnectionStringInput.value.trim() : null,
    );

    publishTargetTestResult.value = result;
  } catch (error) {
    console.error('Failed to test Hearthstone publish target settings:', error);
    publishTargetTestError.value = getConsoleErrorMessage(error, 'Publish target 测试失败');
  } finally {
    testingPublishTarget.value = false;
  }
}

/** Validates that the saved Hearthstone publish target still matches its bound fingerprint. */
async function validatePublishTargetBinding() {
  const publishTarget = savedPublishTarget.value;
  const environment = savedPublishTargetEnvironment.value;
  const targetFingerprint = savedPublishTargetFingerprint.value;

  if (!publishTarget || !environment || !targetFingerprint) {
    publishTargetValidationOk.value = false;
    publishTargetValidationMessage.value = '';
    publishTargetValidationError.value = '缺少已保存的 publish target 绑定信息。';
    return;
  }

  validatingPublishTarget.value = true;
  publishTargetValidationError.value = '';
  publishTargetValidationMessage.value = '';

  try {
    const result = await validateDesktopHearthstonePublishTargetBinding(
      publishTarget,
      environment,
      targetFingerprint,
    );

    publishTargetValidationOk.value = result.isValid;
    publishTargetValidationMessage.value = result.isValid
      ? `当前目标绑定一致：${result.currentPublishTarget ?? '-'} / ${result.currentEnvironment ?? '-'} / fingerprint=${result.currentTargetFingerprint ?? '-'}`
      : result.reasons.join(' ');
  } catch (error) {
    console.error('Failed to validate Hearthstone publish target binding:', error);
    publishTargetValidationError.value = getConsoleErrorMessage(error, 'Publish target 绑定校验失败');
  } finally {
    validatingPublishTarget.value = false;
  }
}

onMounted(() => {
  void loadHearthstoneSettings();
});

watch([
  publishTargetInput,
  publishTargetEnvironmentInput,
  publishTargetConnectionStringInput,
], () => {
  publishTargetError.value = '';
  publishTargetTestError.value = '';
  publishTargetValidationError.value = '';
  publishTargetValidationMessage.value = '';
  publishTargetValidationOk.value = false;
  publishTargetTestResult.value = null;
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
