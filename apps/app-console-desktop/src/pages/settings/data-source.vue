<template>
  <SettingsFrame title="数据目录">
    <UCard v-for="item in items" :key="item.key">
      <SettingField :label="item.label" :value="snapshot?.config.paths[item.key]" directory :save="value => update(`paths.${item.key}`, value)" />
    </UCard>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { useDesktopSettings } from '~/composables/useDesktopSettings';
definePageMeta({ layout: 'admin', title: '数据目录' });
const { snapshot, update } = useDesktopSettings();
const items = [{ key: 'data', label: '数据根目录' }, { key: 'asset', label: '图片根目录' }];
</script>
