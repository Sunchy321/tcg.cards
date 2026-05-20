<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            数据库
          </h1>
          <p class="mt-2 text-sm text-muted">
            配置应用使用的数据库连接。
          </p>
        </div>

        <DesktopConfigHeaderActions />
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <UCard>
          <template #header>
            <div>
              <div class="font-medium">数据库连接</div>
              <div class="mt-1 text-xs text-muted">配置应用使用的数据库连接。</div>
            </div>
          </template>

          <div class="space-y-4">
            <div class="text-sm text-default">
              填写数据库连接字符串后，可以保存配置并测试连接是否可用。
            </div>

            <div class="space-y-2">
              <label for="external-local-pg" class="text-sm font-medium text-default">连接字符串</label>
              <input
                id="external-local-pg"
                v-model="externalConnectionString"
                class="w-full rounded-lg border border-default bg-default px-3 py-2 text-sm text-default"
                placeholder="postgres://user:password@127.0.0.1:5432/tcg_cards_local"
                :disabled="loadingDatabaseSettings || savingDatabaseSettings || testingDatabaseConnection"
              >
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                label="保存数据库连接"
                icon="i-lucide-database"
                color="primary"
                :loading="savingDatabaseSettings"
                :disabled="loadingDatabaseSettings || testingDatabaseConnection"
                @click="saveDatabaseSettings"
              />
              <UButton
                label="测试连接"
                icon="i-lucide-plug"
                color="neutral"
                variant="soft"
                :loading="testingDatabaseConnection"
                :disabled="loadingDatabaseSettings || savingDatabaseSettings"
                @click="testDatabaseConnection"
              />
            </div>

            <UAlert
              v-if="databaseSettingsError.length > 0"
              color="error"
              variant="soft"
              icon="i-lucide-circle-alert"
              :description="databaseSettingsError"
            />
            <UAlert
              v-else-if="databaseSettingsSaved"
              color="success"
              variant="soft"
              icon="i-lucide-circle-check-big"
              description="数据库连接已保存。"
            />
            <UAlert
              v-if="databaseConnectionTestError.length > 0"
              color="error"
              variant="soft"
              icon="i-lucide-plug-zap"
              :description="databaseConnectionTestError"
            />
            <UAlert
              v-else-if="databaseConnectionTestResult"
              color="success"
              variant="soft"
              icon="i-lucide-badge-check"
              :description="`连接成功：database=${databaseConnectionTestResult.databaseName}，user=${databaseConnectionTestResult.userName}，latency=${databaseConnectionTestResult.latencyMs}ms`"
            />
            <UAlert
              v-else-if="externalConnectionString.trim().length === 0"
              color="warning"
              variant="soft"
              icon="i-lucide-plug-zap"
              description="尚未配置数据库连接字符串。"
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
  getDesktopDatabaseSettings,
  setDesktopDatabaseSettings,
  testDesktopDatabaseConnection,
} from '~/composables/useDesktopSettings';
import { useDesktopRuntimeClient } from '~/composables/useDesktopRuntimeClient';

definePageMeta({
  layout: 'admin',
  title:  '数据库',
});

const externalConnectionString = ref('');
const loadingDatabaseSettings = ref(false);
const savingDatabaseSettings = ref(false);
const testingDatabaseConnection = ref(false);
const databaseSettingsError = ref('');
const databaseSettingsSaved = ref(false);
const databaseConnectionTestError = ref('');
const databaseConnectionTestResult = ref<{
  databaseName: string;
  userName:     string;
  latencyMs:    number;
} | null>(null);
const runtimeClient = useDesktopRuntimeClient();

/** Pushes the current desktop database setting into the local Bun runtime. */
async function syncRuntimeDatabaseSettings(connectionString: string | null) {
  await runtimeClient.runtime.configureLocalDatabase({
    connectionString,
  });
}

/** Loads the database connection settings from the desktop runtime. */
async function loadDatabaseSettings() {
  loadingDatabaseSettings.value = true;
  databaseSettingsError.value = '';
  databaseSettingsSaved.value = false;
  databaseConnectionTestError.value = '';
  databaseConnectionTestResult.value = null;

  try {
    const settings = await getDesktopDatabaseSettings();
    externalConnectionString.value = settings.externalConnectionString ?? '';
    await syncRuntimeDatabaseSettings(settings.externalConnectionString);
  } catch (error) {
    console.error('Failed to load desktop database settings:', error);
    databaseSettingsError.value = getConsoleErrorMessage(error, '数据库设置读取失败');
  } finally {
    loadingDatabaseSettings.value = false;
  }
}

/** Persists the database connection string into the desktop runtime. */
async function saveDatabaseSettings() {
  savingDatabaseSettings.value = true;
  databaseSettingsError.value = '';
  databaseSettingsSaved.value = false;

  try {
    const settings = await setDesktopDatabaseSettings(
      externalConnectionString.value.trim().length > 0 ? externalConnectionString.value.trim() : null,
    );

    externalConnectionString.value = settings.externalConnectionString ?? '';
    await syncRuntimeDatabaseSettings(settings.externalConnectionString);
    databaseSettingsSaved.value = true;
  } catch (error) {
    console.error('Failed to save desktop database settings:', error);
    databaseSettingsError.value = getConsoleErrorMessage(error, '数据库设置保存失败');
  } finally {
    savingDatabaseSettings.value = false;
  }
}

/** Tests the current database connection string without requiring a prior save. */
async function testDatabaseConnection() {
  testingDatabaseConnection.value = true;
  databaseConnectionTestError.value = '';
  databaseConnectionTestResult.value = null;

  try {
    const result = await testDesktopDatabaseConnection(
      externalConnectionString.value.trim().length > 0 ? externalConnectionString.value.trim() : null,
    );

    databaseConnectionTestResult.value = result;
  } catch (error) {
    console.error('Failed to test desktop database connection:', error);
    databaseConnectionTestError.value = getConsoleErrorMessage(error, '数据库连接测试失败');
  } finally {
    testingDatabaseConnection.value = false;
  }
}

onMounted(() => {
  void loadDatabaseSettings();
});

watch(externalConnectionString, () => {
  databaseConnectionTestError.value = '';
  databaseConnectionTestResult.value = null;
});
</script>
