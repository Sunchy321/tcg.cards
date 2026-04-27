<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window';

import LoginWindow from './components/LoginWindow.vue';
import MainWindow from './components/MainWindow.vue';

const isLoginWindow = getCurrentWindow().label === 'login';
</script>

<template>
  <UApp>
    <LoginWindow v-if="isLoginWindow" />
    <MainWindow v-else />
  </UApp>
</template>
