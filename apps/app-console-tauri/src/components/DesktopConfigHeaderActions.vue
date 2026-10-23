<template>
  <div class="flex flex-wrap gap-2">
    <UButton
      label="编辑原始配置"
      icon="i-lucide-file-json"
      color="neutral"
      variant="soft"
      to="/settings/config-file"
    />
    <UButton
      label="打开配置目录"
      icon="i-lucide-folder-open"
      color="neutral"
      variant="soft"
      :loading="openingConfigDirectory"
      @click="openConfigDirectory"
    />
  </div>
</template>

<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { getConsoleErrorMessage } from '@tcg-cards/console-core';

import { openDesktopConfigDirectory } from '~/composables/useDesktopSettings';

const toast = useToast();
const openingConfigDirectory = ref(false);

/** Desktop config directory opened in the system file manager. */
async function openConfigDirectory() {
  openingConfigDirectory.value = true;

  try {
    await openDesktopConfigDirectory();
  } catch (error) {
    console.error('Failed to open desktop config directory:', error);
    toast.add({
      color:       'error',
      icon:        'i-lucide-folder-open',
      title:       '配置目录打开失败',
      description: getConsoleErrorMessage(error, '配置目录打开失败'),
    });
  } finally {
    openingConfigDirectory.value = false;
  }
}
</script>
