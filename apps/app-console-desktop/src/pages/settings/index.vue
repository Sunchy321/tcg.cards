<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div>
        <h1 class="desktop-section-title">
          设置
        </h1>
        <p class="mt-2 text-sm text-muted">
          从左侧选择通用设置或游戏设置页面。
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <div class="space-y-6">
          <UCard>
            <template #header>
              <div>
                <div class="font-medium">设置导航</div>
                <div class="mt-1 text-xs text-muted">通用设置和各游戏设置已经拆分为独立页面。</div>
              </div>
            </template>

            <div class="grid gap-3 sm:grid-cols-2">
              <UButton
                label="数据库设置"
                icon="i-lucide-database"
                color="primary"
                class="justify-start"
                to="/settings/database"
              />
              <UButton
                label="Hearthstone 设置"
                icon="i-lucide-flame"
                color="neutral"
                variant="soft"
                class="justify-start"
                to="/settings/games/hearthstone"
              />
              <UButton
                label="Magic 设置"
                icon="i-lucide-sparkles"
                color="neutral"
                variant="soft"
                class="justify-start"
                to="/settings/games/magic"
              />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="font-medium">当前账号</div>
            </template>

            <p class="text-sm text-default">
              {{ currentAuthState?.user.name ?? '—' }}
            </p>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { currentAuthState } from '../../auth';

definePageMeta({
  layout: 'admin',
  title:  '设置',
});
</script>
