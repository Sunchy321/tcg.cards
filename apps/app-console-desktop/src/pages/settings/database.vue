<template>
  <SettingsFrame title="数据库设置">
    <UCard>
      <template #header><h2 class="font-medium">数据库连接</h2></template>
      <SettingField label="连接字符串" secret :configured="snapshot?.credentials.database" placeholder="postgres://user:password@localhost/database" :save="value => secret('database', value)" />
    </UCard>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { useDesktopSettings } from '~/composables/useDesktopSettings';
definePageMeta({ layout: 'admin', title: '数据库设置' });
const { snapshot, secret } = useDesktopSettings();
</script>
