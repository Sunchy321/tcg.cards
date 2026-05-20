<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            原始配置
          </h1>
          <p class="mt-2 text-sm text-muted">
            直接查看和修改 desktop-config.json。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="返回数据库设置"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="soft"
            to="/settings/database"
          />
          <UButton
            label="打开配置目录"
            icon="i-lucide-folder-open"
            color="neutral"
            variant="soft"
            :loading="openingConfigDirectory"
            @click="openConfigDirectory"
          />
          <UButton
            label="复制配置路径"
            icon="i-lucide-copy"
            color="neutral"
            variant="soft"
            :disabled="loadingRawConfig || rawConfigFilePath === '—'"
            @click="copyConfigFilePath"
          />
          <UButton
            label="格式化"
            icon="i-lucide-braces"
            color="neutral"
            variant="soft"
            :disabled="loadingRawConfig || savingRawConfig"
            @click="formatRawConfig"
          />
        </div>
      </div>

      <UCard>
        <template #header>
          <div>
            <div class="font-medium">desktop-config.json</div>
            <div class="mt-1 text-xs text-muted">原始 JSON 编辑入口会覆盖按项配置页面，不显示左侧设置边栏。</div>
          </div>
        </template>

        <div class="space-y-4">
          <div class="grid gap-3 rounded-lg border border-default/60 bg-elevated/30 p-3 text-sm sm:grid-cols-2">
            <div class="space-y-1">
              <div class="text-xs text-muted">配置文件</div>
              <code class="block break-all text-xs text-default">{{ rawConfigFilePath }}</code>
            </div>

            <div class="space-y-1">
              <div class="text-xs text-muted">配置目录</div>
              <code class="block break-all text-xs text-default">{{ rawConfigDirectoryPath }}</code>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              label="重新加载"
              icon="i-lucide-rotate-ccw"
              color="neutral"
              variant="soft"
              :loading="loadingRawConfig"
              :disabled="savingRawConfig"
              @click="loadRawConfig"
            />
            <UButton
              label="保存原始配置"
              icon="i-lucide-save"
              color="primary"
              :loading="savingRawConfig"
              :disabled="loadingRawConfig || rawConfigHasValidationErrors"
              @click="saveRawConfig"
            />
          </div>

          <UAlert
            color="neutral"
            variant="soft"
            icon="i-lucide-info"
            description="该 JSON 文件只包含配置文件内的字段，不包含 publish target 连接字符串和登录凭据。"
          />

          <div class="space-y-2">
            <label for="desktop-raw-config" class="text-sm font-medium text-default">配置内容</label>
            <ClientOnly fallback-tag="div">
              <MonacoJsonEditor
                ref="editor"
                v-model="rawConfigText"
                :schema="desktopConfigSchema"
                :disabled="loadingRawConfig || savingRawConfig"
                @validation-change="handleValidationChange"
              />

              <template #fallback>
                <div class="rounded-lg border border-default bg-default px-4 py-8 text-sm text-muted">
                  正在加载编辑器…
                </div>
              </template>
            </ClientOnly>
          </div>

          <UAlert
            v-if="configDirectoryError.length > 0"
            color="error"
            variant="soft"
            icon="i-lucide-folder-open"
            :description="configDirectoryError"
          />
          <UAlert
            v-if="copyPathMessage.length > 0"
            color="success"
            variant="soft"
            icon="i-lucide-copy"
            :description="copyPathMessage"
          />
          <UAlert
            v-if="rawConfigError.length > 0"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="rawConfigError"
          />
          <UAlert
            v-else-if="rawConfigValidationMessage.length > 0"
            color="warning"
            variant="soft"
            icon="i-lucide-triangle-alert"
            :description="rawConfigValidationMessage"
          />
          <UAlert
            v-else-if="rawConfigSaved"
            color="success"
            variant="soft"
            icon="i-lucide-circle-check-big"
            description="原始配置已保存。"
          />
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { desktopConfigSchema } from '~/utils/desktopConfigSchema';
import {
  getDesktopRawConfig,
  openDesktopConfigDirectory,
  setDesktopRawConfig,
  type DesktopRawConfig,
} from '~/composables/useDesktopSettings';
import type {
  MonacoJsonEditorRef,
  MonacoJsonEditorValidation,
} from '~/types/monaco-json-editor';

definePageMeta({
  layout: 'admin',
  title:  '原始配置',
});

const rawConfigText = ref('');
const loadingRawConfig = ref(false);
const savingRawConfig = ref(false);
const openingConfigDirectory = ref(false);
const rawConfigError = ref('');
const configDirectoryError = ref('');
const copyPathMessage = ref('');
const rawConfigSaved = ref(false);
const rawConfigFilePath = ref('—');
const rawConfigDirectoryPath = ref('—');
const rawConfigHasValidationErrors = ref(false);
const rawConfigValidationMessages = ref<string[]>([]);
const editor = ref<MonacoJsonEditorRef | null>(null);
const rawConfigValidationMessage = computed(() => rawConfigValidationMessages.value[0] ?? '');

/** Applies one raw-config payload to the local page state. */
function applyRawConfig(payload: DesktopRawConfig) {
  rawConfigText.value = payload.text;
  rawConfigFilePath.value = payload.file.configFilePath;
  rawConfigDirectoryPath.value = payload.file.configDirectoryPath;
}

/** Monaco validation state synchronized into the page-level save controls. */
function handleValidationChange(payload: MonacoJsonEditorValidation) {
  rawConfigHasValidationErrors.value = payload.hasErrors;
  rawConfigValidationMessages.value = payload.messages;
}

/** Loads the raw desktop config text from the desktop runtime. */
async function loadRawConfig() {
  loadingRawConfig.value = true;
  rawConfigError.value = '';
  rawConfigSaved.value = false;
  copyPathMessage.value = '';

  try {
    applyRawConfig(await getDesktopRawConfig());
  } catch (error) {
    console.error('Failed to load desktop raw config:', error);
    rawConfigError.value = getConsoleErrorMessage(error, '原始配置读取失败');
  } finally {
    loadingRawConfig.value = false;
  }
}

/** Persists the raw desktop config text into the desktop runtime. */
async function saveRawConfig() {
  savingRawConfig.value = true;
  rawConfigError.value = '';
  rawConfigSaved.value = false;
  copyPathMessage.value = '';

  try {
    const payload = await setDesktopRawConfig(rawConfigText.value);
    applyRawConfig(payload);
    rawConfigSaved.value = true;
  } catch (error) {
    console.error('Failed to save desktop raw config:', error);
    rawConfigError.value = getConsoleErrorMessage(error, '原始配置保存失败');
  } finally {
    savingRawConfig.value = false;
  }
}

/** Desktop config directory opened in the system file manager. */
async function openConfigDirectory() {
  openingConfigDirectory.value = true;
  configDirectoryError.value = '';
  copyPathMessage.value = '';

  try {
    await openDesktopConfigDirectory();
  } catch (error) {
    console.error('Failed to open desktop config directory:', error);
    configDirectoryError.value = getConsoleErrorMessage(error, '配置目录打开失败');
  } finally {
    openingConfigDirectory.value = false;
  }
}

/** Config file path copied into the system clipboard. */
async function copyConfigFilePath() {
  copyPathMessage.value = '';

  try {
    await navigator.clipboard.writeText(rawConfigFilePath.value);
    copyPathMessage.value = '配置文件路径已复制。';
  } catch (error) {
    console.error('Failed to copy desktop config file path:', error);
    rawConfigError.value = getConsoleErrorMessage(error, '配置文件路径复制失败');
  }
}

/** Editor document formatted before an optional save. */
async function formatRawConfig() {
  await editor.value?.formatDocument();
}

onMounted(() => {
  void loadRawConfig();
});

watch(rawConfigText, () => {
  rawConfigError.value = '';
  rawConfigSaved.value = false;
  copyPathMessage.value = '';
});
</script>
