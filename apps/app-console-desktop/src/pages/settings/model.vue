<template>
  <SettingsFrame title="模型配置">
    <UCard>
      <div class="space-y-5">
        <SettingField label="API Key" secret :configured="snapshot?.credentials.ai" :save="value => secret('ai', value)" />
        <SettingField label="服务地址" :value="snapshot?.config.ai.baseUrl" placeholder="https://api.openai.com/v1" :save="value => update('ai.baseUrl', value)" />
        <SettingField label="模型名称" :value="snapshot?.config.ai.model" :save="value => update('ai.model', value)" />
      </div>
    </UCard>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { useDesktopSettings } from '~/composables/useDesktopSettings';
definePageMeta({ layout: 'admin', title: '模型配置' });
const { snapshot, update, secret } = useDesktopSettings();
</script>
