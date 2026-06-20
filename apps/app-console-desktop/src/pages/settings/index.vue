<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            设置
          </h1>
          <p class="mt-2 text-sm text-muted">
            从左侧选择通用设置或游戏设置页面。
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
                <div class="font-medium">设置导航</div>
                <div class="mt-1 text-xs text-muted">通用设置和各游戏设置已经拆分为独立页面。</div>
              </div>
            </template>

            <div class="grid gap-3 sm:grid-cols-2">
              <UButton
                label="数据库设置"
                icon="i-lucide-database"
                color="primary"
                class="justify-start"
                to="/settings/database"
              />
              <UButton
                label="发布配置"
                icon="i-lucide-upload"
                color="neutral"
                variant="soft"
                class="justify-start"
                to="/settings/publish"
              />
              <UButton
                v-for="item in gameButtons"
                :key="item.to"
                :label="item.buttonLabel"
                :icon="item.icon"
                color="neutral"
                variant="soft"
                class="justify-start"
                :to="item.to"
              />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="font-medium">当前账号</div>
            </template>

            <p class="text-sm text-default">
              {{ currentAuthState?.user.name ?? '—' }}
            </p>
          </UCard>

          <UCard>
            <template #header>
              <div>
                <div class="font-medium">Desktop Runtime</div>
                <div class="mt-1 text-xs text-muted">本地 Bun runtime 的最小连通性检查。</div>
              </div>
            </template>

            <div class="space-y-3 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="text-muted">RPC URL</span>
                <code class="text-xs">{{ runtimeUrl }}</code>
              </div>

              <div class="flex items-center justify-between gap-3">
                <span class="text-muted">状态</span>
                <UBadge
                  :color="runtimeStateColor"
                  variant="soft"
                >
                  {{ runtimeStateLabel }}
                </UBadge>
              </div>

              <div
                v-if="runtimeHealth"
                class="flex items-center justify-between gap-3"
              >
                <span class="text-muted">响应时间</span>
                <span>{{ runtimeHealth.time }}</span>
              </div>

              <div
                v-if="runtimeError"
                class="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-error"
              >
                {{ runtimeError }}
              </div>

              <div class="flex gap-3">
                <UButton
                  label="检查运行时"
                  icon="i-lucide-activity"
                  color="primary"
                  :loading="runtimeLoading"
                  @click="refreshRuntimeHealth"
                />
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { settingsGameItems } from '~/composables/settings-games';
import {
  readDesktopRuntimeRpcUrl,
  useDesktopRuntimeClient,
} from '~/composables/useDesktopRuntimeClient';

import { currentAuthState } from '../../auth';

const gameButtons = settingsGameItems.map(item => ({
  ...item,
  buttonLabel: `${item.label} 设置`,
}));

const runtimeClient = useDesktopRuntimeClient();
const runtimeUrl = readDesktopRuntimeRpcUrl();
const runtimeHealth = ref<Awaited<ReturnType<typeof runtimeClient.runtime.health>> | null>(null);
const runtimeError = ref<string | null>(null);
const runtimeLoading = ref(false);

const runtimeStateLabel = computed(() => {
  if (runtimeLoading.value) {
    return 'checking';
  }

  if (runtimeError.value) {
    return 'offline';
  }

  return runtimeHealth.value?.status ?? 'idle';
});

const runtimeStateColor = computed(() => {
  if (runtimeLoading.value) {
    return 'warning';
  }

  if (runtimeError.value) {
    return 'error';
  }

  return runtimeHealth.value ? 'success' : 'neutral';
});

/** Loads the current desktop runtime health state from the local Bun RPC endpoint. */
async function refreshRuntimeHealth() {
  runtimeLoading.value = true;
  runtimeError.value = null;

  try {
    runtimeHealth.value = await runtimeClient.runtime.health();
  } catch (error) {
    runtimeHealth.value = null;
    runtimeError.value = error instanceof Error ? error.message : String(error);
  } finally {
    runtimeLoading.value = false;
  }
}

definePageMeta({
  layout: 'admin',
  title:  '设置',
});

onMounted(() => {
  void refreshRuntimeHealth();
});
</script>
