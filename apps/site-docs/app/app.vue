<script setup lang="ts">
const { locale, setLocale } = useI18n();
const { config } = useGlobalConfig();

watch(() => config.value.lang, (language) => {
  if (language !== locale.value) {
    setLocale(language);
  }
}, { immediate: true });
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
