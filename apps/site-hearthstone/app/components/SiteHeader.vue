<template>
  <header class="site-header sticky top-0 z-50 border-b backdrop-blur">
    <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
      <NuxtLink
        :to="mainSiteUrl"
        target="_blank"
        class="site-header-link flex items-center gap-2 text-sm transition"
      >
        <UIcon name="lucide:arrow-left" class="text-base" />
        <span>{{ $t('common.backToMain') ?? 'Back to TCG Cards' }}</span>
      </NuxtLink>

      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
const config = useRuntimeConfig();
const mainSiteUrl = config.public.mainSiteUrl ?? 'http://localhost:3000';
</script>
