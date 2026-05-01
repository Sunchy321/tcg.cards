<script setup lang="ts">
import { provideConsolePlatform } from '@tcg-cards/console-platform';
import { getCurrentWindow } from '@tauri-apps/api/window';

import LoginWindow from './components/LoginWindow.vue';
import MainWindow from './components/MainWindow.vue';
import { useDesktopConsolePlatform } from './composables/useConsolePlatform';

const isLoginWindow = getCurrentWindow().label === 'login';

provideConsolePlatform(useDesktopConsolePlatform());
</script>

<template>
  <UApp>
    <LoginWindow v-if="isLoginWindow" />
    <MainWindow v-else />
  </UApp>
</template>
