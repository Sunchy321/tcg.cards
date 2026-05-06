<template>
  <UApp>
    <LoginWindow v-if="isLoginWindow" />
    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import { provideConsolePlatform } from '@tcg-cards/console-platform';
import { provideConsoleAdminHost } from '@tcg-cards/console-shell/app/composables/admin-host';
import { getCurrentWindow } from '@tauri-apps/api/window';

import LoginWindow from './components/LoginWindow.vue';
import { useDesktopConsoleAdminHost } from './composables/useConsoleAdminHost';
import { useDesktopConsolePlatform } from './composables/useConsolePlatform';

const isLoginWindow = import.meta.client && getCurrentWindow().label === 'login';
const platform = useDesktopConsolePlatform();

provideConsolePlatform(platform);

if (!isLoginWindow) {
  provideConsoleAdminHost(useDesktopConsoleAdminHost(platform.storage));
}
</script>
