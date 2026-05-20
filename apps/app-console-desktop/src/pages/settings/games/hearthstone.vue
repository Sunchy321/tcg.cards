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
                    v-model="publishTargetIdInput"
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
                :description="`当前已保存目标：${savedPublishTargetId ?? '-'} / ${savedPublishTargetEnvironment ?? '-'} / fingerprint=${savedPublishTargetFingerprint}`"
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
                :description="`连接成功：target=${publishTargetTestResult.publishTargetId}，env=${publishTargetTestResult.environment}，database=${publishTargetTestResult.databaseName}，user=${publishTargetTestResult.userName}，host=${publishTargetTestResult.serverHost}:${publishTargetTestResult.serverPort}，latency=${publishTargetTestResult.latencyMs}ms，fingerprint=${publishTargetTestResult.targetFingerprint}`"
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import {
  getDesktopHearthstonePublishTarget,
  getDesktopGameRepo,
  pickDesktopDirectory,
  setDesktopHearthstonePublishTarget,
  setDesktopGameRepo,
  testDesktopHearthstonePublishTarget,
  validateDesktopHearthstonePublishTargetBinding,
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
const publishTargetIdInput = ref('');
const publishTargetEnvironmentInput = ref('');
const publishTargetConnectionStringInput = ref('');
const savedPublishTargetId = ref<string | null>(null);
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
  publishTargetId:   string;
  environment:       string;
  targetFingerprint: string;
  databaseName:      string;
  userName:          string;
  serverHost:        string;
  serverPort:        number;
  latencyMs:         number;
} | null>(null);

/** Loads the configured hsdata repository path. */
async function loadHearthstoneSettings() {
  loadingHsdataRepoPath.value = true;
  loadingPublishTarget.value = true;
  hsdataRepoPathError.value = '';
  publishTargetError.value = '';

  try {
    const repoPath = await getDesktopGameRepo('hearthstone', 'hsdata');
    const publishTarget = await getDesktopHearthstonePublishTarget();

    savedHsdataRepoPath.value = repoPath;
    hsdataRepoPathInput.value = repoPath ?? '';
    savedPublishTargetId.value = publishTarget.publishTargetId ?? null;
    savedPublishTargetEnvironment.value = publishTarget.environment ?? null;
    savedPublishTargetFingerprint.value = publishTarget.targetFingerprint ?? null;
    publishTargetIdInput.value = publishTarget.publishTargetId ?? '';
    publishTargetEnvironmentInput.value = publishTarget.environment ?? '';
    publishTargetConnectionStringInput.value = publishTarget.connectionString ?? '';
  } catch (error) {
    console.error('Failed to load desktop Hearthstone settings:', error);
    hsdataRepoPathError.value = getConsoleErrorMessage(error, '设置读取失败');
    publishTargetError.value = getConsoleErrorMessage(error, '设置读取失败');
  } finally {
    loadingHsdataRepoPath.value = false;
    loadingPublishTarget.value = false;
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

/** Persists the Hearthstone publish target settings. */
async function savePublishTarget() {
  savingPublishTarget.value = true;
  publishTargetError.value = '';

  try {
    const settings = await setDesktopHearthstonePublishTarget(
      publishTargetIdInput.value.trim().length > 0 ? publishTargetIdInput.value.trim() : null,
      publishTargetEnvironmentInput.value.trim().length > 0 ? publishTargetEnvironmentInput.value.trim() : null,
      publishTargetConnectionStringInput.value.trim().length > 0 ? publishTargetConnectionStringInput.value.trim() : null,
    );

    savedPublishTargetId.value = settings.publishTargetId ?? null;
    savedPublishTargetEnvironment.value = settings.environment ?? null;
    savedPublishTargetFingerprint.value = settings.targetFingerprint ?? null;
    publishTargetIdInput.value = settings.publishTargetId ?? '';
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

    savedPublishTargetId.value = settings.publishTargetId ?? null;
    savedPublishTargetEnvironment.value = settings.environment ?? null;
    savedPublishTargetFingerprint.value = settings.targetFingerprint ?? null;
    publishTargetIdInput.value = settings.publishTargetId ?? '';
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
      publishTargetIdInput.value.trim().length > 0 ? publishTargetIdInput.value.trim() : null,
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
  const publishTargetId = savedPublishTargetId.value;
  const environment = savedPublishTargetEnvironment.value;
  const targetFingerprint = savedPublishTargetFingerprint.value;

  if (!publishTargetId || !environment || !targetFingerprint) {
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
      publishTargetId,
      environment,
      targetFingerprint,
    );

    publishTargetValidationOk.value = result.isValid;
    publishTargetValidationMessage.value = result.isValid
      ? `当前目标绑定一致：${result.currentPublishTargetId ?? '-'} / ${result.currentEnvironment ?? '-'} / fingerprint=${result.currentTargetFingerprint ?? '-'}`
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
  publishTargetIdInput,
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
</script>
