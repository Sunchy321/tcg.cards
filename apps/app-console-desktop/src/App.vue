<script setup lang="ts">
import { provideConsolePlatform } from '@tcg-cards/console-platform';
import { getCurrentWindow } from '@tauri-apps/api/window';

import LoginWindow from './components/LoginWindow.vue';
import { useDesktopConsolePlatform } from './composables/useConsolePlatform';

const isLoginWindow = import.meta.client && getCurrentWindow().label === 'login';

provideConsolePlatform(useDesktopConsolePlatform());
</script>

<template>
  <UApp>
    <LoginWindow v-if="isLoginWindow" />
    <NuxtLayout v-else>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
