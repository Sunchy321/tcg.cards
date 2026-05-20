<template>
  <div class="desktop-page">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="desktop-section-title">
            Magic 设置
          </h1>
          <p class="mt-2 text-sm text-muted">
            管理 Magic 相关的桌面端配置。
          </p>
        </div>

        <DesktopConfigHeaderActions />
      </div>

      <div class="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <DesktopSettingsSidebar />

        <UCard>
          <template #header>
            <div>
              <div class="font-medium">当前状态</div>
              <div class="mt-1 text-xs text-muted">Magic 设置页已预留，后续在这里添加具体配置项。</div>
            </div>
          </template>

          <div class="text-sm text-muted">
            当前还没有可编辑配置项。
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  title:  'Magic 设置',
});
</script>
