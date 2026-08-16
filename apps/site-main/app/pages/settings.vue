<template>
  <div class="max-w-2xl mx-auto py-8 px-4">
    <SettingsCard :title="$t('settings.general.$self')">
      <SettingsRow :label="$t('settings.general.uiLanguage')">
        <USelect
          v-model="appLocale"
          :items="appLocaleItems"
          class="w-44"
        />
      </SettingsRow>
      <USeparator />
      <SettingsRow :label="$t('settings.general.theme')">
        <USelect
          v-model="themeValue"
          :items="themeItems"
          class="w-44"
        />
      </SettingsRow>
    </SettingsCard>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' });

const { t, locale, setLocale, availableLocales } = useI18n();

useTitle(() => t('settings.$self'));

const { config: globalConfig, setConfig: setGlobalConfig } = useGlobalConfig();

const appLocale = computed({
  get: () => globalConfig.value.lang,
  set: (val) => setGlobalConfig('lang', val),
});

watch(globalConfig, (cfg) => {
  if (cfg.lang !== locale.value) {
    setLocale(cfg.lang);
  }
}, { immediate: true });

const colorMode = useColorMode();
const themeValue = computed({
  get: () => colorMode.preference === 'system' ? 'auto' : colorMode.preference,
  set: (val) => {
    colorMode.preference = val === 'auto' ? 'system' : val;
    setGlobalConfig('theme', val);
  },
});
watch(() => globalConfig.value.theme, (val) => {
  themeValue.value = val;
}, { immediate: true });

const appLocaleItems = computed(() =>
  availableLocales.map(code => ({
    value: code,
    label: t(`lang.$self`, code, { locale: code }),
  })),
);

const themeItems = computed(() => [
  { value: 'light', label: t('settings.general.themeLight') },
  { value: 'dark', label: t('settings.general.themeDark') },
  { value: 'auto', label: t('settings.general.themeAuto') },
]);
</script>
