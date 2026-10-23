<template>
  <UApp>
    <LoginWindow v-if="isLoginWindow" />
    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { isTauri } from '@tauri-apps/api/core';
import { provideConsolePlatform } from '@tcg-cards/console-platform';
import { provideConsoleAdminHost } from '@tcg-cards/console-shell/app/composables/admin-host';
import { provideConsoleFieldSyncHost } from '@tcg-cards/console-shell/app/composables/field-sync-host';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { watch } from 'vue';

import LoginWindow from './components/LoginWindow.vue';
import { currentAuthState } from './auth';
import { useDesktopConsoleAdminHost } from './composables/useConsoleAdminHost';
import { useDesktopConsoleFieldSyncHost } from './composables/useConsoleFieldSyncHost';
import { useDesktopConsolePlatform } from './composables/useConsolePlatform';
import { useDesktopRuntimeClient } from './composables/useDesktopRuntimeClient';

const isDesktopRuntime = import.meta.client && isTauri();
const isLoginWindow = isDesktopRuntime && getCurrentWindow().label === 'login';
const platform = useDesktopConsolePlatform();

provideConsolePlatform(platform);

if (isDesktopRuntime && !isLoginWindow) {
  provideConsoleAdminHost(useDesktopConsoleAdminHost(platform.storage));
  provideConsoleFieldSyncHost(useDesktopConsoleFieldSyncHost(platform.api));
}

// Sync editor identity with auth state
if (isDesktopRuntime) {
  const runtime = useDesktopRuntimeClient();
  watch(currentAuthState, (state) => {
    const username = state?.user?.username ?? state?.user?.name ?? 'unknown';
    void runtime.runtime.configureEditorIdentity({ editorIdentity: username });
  }, { immediate: true });
}
</script>
