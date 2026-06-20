<template>
  <UCard>
    <template #header>
      <div class="font-medium">
        设置分类
      </div>
    </template>

    <div class="space-y-5">
      <section class="space-y-2">
        <div class="text-xs font-medium tracking-wide text-muted">
          通用设置
        </div>
        <div class="space-y-2">
          <UButton
            v-for="item in generalItems"
            :key="item.to"
            :label="item.label"
            :icon="item.icon"
            color="neutral"
            :variant="route.path === item.to ? 'soft' : 'ghost'"
            class="w-full justify-start"
            :to="item.to"
          />
        </div>
      </section>

      <section class="space-y-2">
        <div class="text-xs font-medium tracking-wide text-muted">
          游戏设置
        </div>
        <div class="space-y-2">
          <UButton
            v-for="item in gameItems"
            :key="item.to"
            :label="item.label"
            :icon="item.icon"
            color="neutral"
            :variant="route.path === item.to ? 'soft' : 'ghost'"
            class="w-full justify-start"
            :to="item.to"
          />
        </div>
      </section>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { settingsGameItems } from '~/composables/settings-games';

const route = useRoute();

const generalItems = [
  {
    label: '数据库',
    icon:  'i-lucide-database',
    to:    '/settings/database',
  },
  {
    label: '发布配置',
    icon:  'i-lucide-upload',
    to:    '/settings/publish',
  },
];

const gameItems = settingsGameItems;
</script>
