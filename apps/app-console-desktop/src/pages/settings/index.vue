<template>
  <SettingsFrame title="设置" description="从左侧选择通用设置或游戏设置页面。">
    <UCard>
      <template #header><h2 class="font-medium">设置导航</h2></template>
      <div class="grid gap-3 sm:grid-cols-2">
        <UButton v-for="item in items" :key="item.to" :label="item.buttonLabel" :icon="item.icon" :to="item.to" :color="item.to === '/settings/database' ? 'primary' : 'neutral'" :variant="item.to === '/settings/database' ? 'solid' : 'soft'" class="justify-start" />
      </div>
    </UCard>
  </SettingsFrame>
</template>
<script setup lang="ts">
import { generalSettings, gameSettings } from '~/composables/settings-navigation';
definePageMeta({ layout: 'admin', title: '设置' });
const items = [...generalSettings, ...gameSettings];
</script>
