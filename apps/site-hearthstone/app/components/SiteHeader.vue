<template>
  <header class="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur">
    <div class="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
      <NuxtLink
        :to="mainSiteUrl"
        target="_blank"
        class="flex items-center gap-2 text-sm text-white/70 hover:text-white transition"
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
