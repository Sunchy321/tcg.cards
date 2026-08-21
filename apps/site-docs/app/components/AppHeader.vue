<template>
  <header class="docs-header sticky top-0 z-50 border-b border-default bg-default/92 backdrop-blur-xl">
    <div class="flex h-15 items-center gap-4 px-4 lg:px-6">
      <NuxtLink to="/v1" class="group flex items-center gap-3 text-highlighted">
        <span class="grid size-8 place-items-center rounded-md bg-primary text-inverted shadow-sm shadow-primary/20">
          <Icon name="i:logo" :size="22" />
        </span>
        <span class="hidden font-semibold tracking-tight sm:inline">TCG.CARDS</span>
      </NuxtLink>

      <div class="h-5 w-px bg-accented" />
      <span class="min-w-0 truncate text-sm font-medium text-muted">{{ gameName }}</span>

      <div class="ml-auto flex items-center gap-1.5">
        <UBadge color="neutral" variant="subtle" class="font-mono">v1</UBadge>
        <UColorModeButton color="neutral" variant="ghost" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
const { t } = useI18n();
const route = useRoute();
const game = computed(() => route.path.split('/')[2]);
const gameName = computed(() => game.value === 'magic' || game.value === 'hearthstone' ? t(`${game.value}.name`) : t('portal.title'));
</script>
