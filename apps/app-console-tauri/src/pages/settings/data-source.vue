<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            数据目录
          </h1>
          <p class="mt-2 text-sm text-muted">
            配置全局数据/图片根目录，各游戏的数据目录与叶子路径从它推导。
          </p>
        </div>

        <DesktopConfigHeaderActions />
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <div class="space-y-6">
          <UCard>
            <template #header>
              <div>
                <div class="font-medium">全局数据根（data）</div>
                <div class="mt-1 text-xs text-muted">各游戏数据目录从它推导，如 {data}/magic、{data}/hearthstone。</div>
              </div>
            </template>

            <div class="space-y-4">
              <DirectoryPickerField
                :value="dataRootInput"
                placeholder="/absolute/path/to/data"
                :loading="loading"
                :pick-loading="picking === 'data'"
                :pick-disabled="loading || saving"
                :clear-disabled="saving || picking !== null || dataRootInput.trim().length === 0"
                @pick="pick('data')"
                @clear="clear('data')"
              />

              <UAlert
                v-if="errorMessage"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="errorMessage"
              />
              <UAlert
                v-else-if="dataRootInput"
                color="success"
                variant="soft"
                icon="i-lucide-circle-check-big"
                :description="`当前数据根：${dataRootInput}`"
              />
              <UAlert
                v-else
                color="warning"
                variant="soft"
                icon="i-lucide-folder-search"
                description="尚未配置数据根，游戏数据叶子不会自动推导。"
              />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div>
                <div class="font-medium">全局图片根（asset）</div>
                <div class="mt-1 text-xs text-muted">各游戏图片目录从它推导，如 {asset}/magic/card。</div>
              </div>
            </template>

            <div class="space-y-4">
              <DirectoryPickerField
                :value="assetRootInput"
                placeholder="/absolute/path/to/asset"
                :loading="loading"
                :pick-loading="picking === 'asset'"
                :pick-disabled="loading || saving"
                :clear-disabled="saving || picking !== null || assetRootInput.trim().length === 0"
                @pick="pick('asset')"
                @clear="clear('asset')"
              />

              <UAlert
                v-if="errorMessage"
                color="error"
                variant="soft"
                icon="i-lucide-circle-alert"
                :description="errorMessage"
              />
              <UAlert
                v-else-if="assetRootInput"
                color="success"
                variant="soft"
                icon="i-lucide-circle-check-big"
                :description="`当前图片根：${assetRootInput}`"
              />
              <UAlert
                v-else
                color="warning"
                variant="soft"
                icon="i-lucide-image-off"
                description="尚未配置图片根，游戏图片叶子不会自动推导。"
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

import { pickDesktopDirectory } from '~/composables/useDesktopSettings';
import { getPath, setPath } from '~/composables/useGamePaths';

definePageMeta({
  layout: 'admin',
  title:  '数据目录',
});

const dataRootInput = ref('');
const assetRootInput = ref('');
const loading = ref(false);
const saving = ref(false);
const picking = ref<string | null>(null);
const errorMessage = ref('');

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [data, asset] = await Promise.all([getPath('data'), getPath('asset')]);
    dataRootInput.value = data ?? '';
    assetRootInput.value = asset ?? '';
  } catch (error) {
    errorMessage.value = getConsoleErrorMessage(error, '设置读取失败');
  } finally {
    loading.value = false;
  }
}

async function persist(key: string, value: string | null) {
  saving.value = true;
  errorMessage.value = '';
  try {
    await setPath(key, value);
    await load();
  } catch (error) {
    errorMessage.value = getConsoleErrorMessage(error, '设置保存失败');
  } finally {
    saving.value = false;
  }
}

async function pick(key: string) {
  picking.value = key;
  errorMessage.value = '';
  try {
    const current = key === 'data' ? dataRootInput.value : assetRootInput.value;
    const dir = await pickDesktopDirectory(current.trim() || null);
    if (dir) await persist(key, dir);
  } catch (error) {
    errorMessage.value = getConsoleErrorMessage(error, '目录选择失败');
  } finally {
    picking.value = null;
  }
}

function clear(key: string) {
  void persist(key, null);
}

onMounted(() => {
  void load();
});
</script>
