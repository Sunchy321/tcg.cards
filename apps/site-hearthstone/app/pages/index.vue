<template>
  <div class="mx-auto mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
    <NuxtLink
      to="/search"
      class="flex flex-row items-center gap-4 px-4 py-4 w-full rounded-xl ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
    >
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
        <UIcon name="lucide:search" class="text-xl shrink-0" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="text-lg font-semibold">{{ $t('hearthstone.search.$self') }}</div>
        <div class="text-sm text-white/70">{{ $t('hearthstone.search.hint') }}</div>
      </div>
    </NuxtLink>

    <NuxtLink
      to="/search/advanced"
      class="flex flex-row items-center gap-4 px-4 py-4 w-full rounded-xl ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
    >
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
        <UIcon name="lucide:sliders-horizontal" class="text-xl shrink-0" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="text-lg font-semibold">{{ $t('hearthstone.search.advanced.$self') }}</div>
        <div class="text-sm text-white/70">{{ $t('hearthstone.search.advanced.entryHint') }}</div>
      </div>
    </NuxtLink>

    <NuxtLink
      :to="{ path: '/search', query: { q: 'order:set+,name+' } }"
      class="flex flex-row items-center gap-4 px-4 py-4 w-full rounded-xl ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
    >
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
        <UIcon name="lucide:library" class="text-xl shrink-0" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="text-lg font-semibold">{{ $t('hearthstone.search.advanced.browseSets') }}</div>
        <div class="text-sm text-white/70">{{ $t('hearthstone.search.advanced.browseSetsHint') }}</div>
      </div>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
const { setActions } = useActions();
const actionMeta = getHearthstoneActionMeta();
const actions = useHearthstoneActions();

definePageMeta({
  layout:  'entry',
  title:   'Hearthstone',
  actions: [actionMeta.random],
});

const { t } = useI18n();

useTitle(t('hearthstone.$self'));

setActions([actions.random]);
</script>
