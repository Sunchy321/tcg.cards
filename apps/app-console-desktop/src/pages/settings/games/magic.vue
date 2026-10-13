<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            Magic 设置
          </h1>
          <p class="mt-2 text-sm text-muted">
            配置万智牌数据目录与图片目录。未显式设置时自动从全局数据根推导（文件夹存在即适用），全局根在「数据目录」中配置。
          </p>
        </div>

        <DesktopConfigHeaderActions />
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <div class="space-y-6">
          <PathLeavesCard
            title="数据目录"
            key-prefix="magic.data"
            :root="pathState?.data.root ?? null"
            :root-explicit="pathState?.data.rootExplicit ?? false"
            :leaves="pathState?.data.leaves ?? []"
            :loading="loading || saving"
            @save="saveLeaf"
          />

          <PathLeavesCard
            title="图片目录"
            key-prefix="magic.image"
            :root="pathState?.image.root ?? null"
            :root-explicit="pathState?.image.rootExplicit ?? false"
            :leaves="pathState?.image.leaves ?? []"
            :loading="loading || saving"
            @save="saveLeaf"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { getGamePathState, setPath, type GamePathState } from '~/composables/useGamePaths';

definePageMeta({
  layout: 'admin',
  title:  'Magic 设置',
});

const pathState = ref<GamePathState | null>(null);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');

async function load() {
  loading.value = true;
  errorMessage.value = '';
  try {
    pathState.value = await getGamePathState('magic');
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

async function saveLeaf(key: string, value: string | null) {
  await persist(key, value);
}

onMounted(() => {
  void load();
});
</script>
