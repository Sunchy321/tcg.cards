<template>
  <UApp :locale="uiLocale">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

<script setup lang="ts">
import uiEn from '@nuxt/ui/runtime/locale/en.js';
import uiZhCn from '@nuxt/ui/runtime/locale/zh_cn.js';

const { locale, setLocale } = useI18n();
const { config } = useGlobalConfig();
const uiLocale = computed(() => (locale.value === 'zhs' ? uiZhCn : uiEn));

watch(() => config.value.lang, language => {
  if (language !== locale.value) {
    setLocale(language);
  }
}, { immediate: true });
</script>
