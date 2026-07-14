<template>
  <UDropdownMenu
    v-if="gameLocales.length > 1"
    :items="localeMenuItems"
    :ui="{ content: 'min-w-fit' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      class="text-white hover:bg-white/20 hover:text-white font-mono font-semibold"
    >
      {{ gameConfig.locale }}
    </UButton>
    <template #locale-item="{ item }">
      <span class="font-mono shrink-0 min-w-10">{{ item.code }}</span>
      <span class="text-muted-foreground">{{ item.label }}</span>
    </template>
  </UDropdownMenu>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const appConfig = useAppConfig();
const gameLocale = useGameLocale();
const gameLocales = appConfig.locales ?? [];
const { config: gameConfig, setConfig: setGameConfig } = useUserConfig();
const { t } = useI18n();

const localeMenuItems = computed(() => {
  return gameLocales.map(l => ({
    code:     l,
    label:    t(`locale.${l}`, l),
    slot:     'locale-item' as const,
    onSelect: () => { setGameConfig('locale', l); },
  }));
});

defineExpose({ gameLocale });
</script>
