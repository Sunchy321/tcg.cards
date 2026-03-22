<template>
  <div class="grid grid-cols-3 gap-4 mt-8">
    <!-- Left column: Card search -->
    <div class="flex flex-col gap-2 justify-start items-center">
      <NuxtLink
        to="/search"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:search" class="text-md shrink-0" />
        <span>{{ $t('hearthstone.card.$self') }}</span>
      </NuxtLink>
    </div>
    <div class="flex flex-col gap-2 justify-start items-center">
      <NuxtLink
        to="/set"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:library" class="text-md shrink-0" />
        <span>{{ $t('hearthstone.set.$self') }}</span>
      </NuxtLink>
      <NuxtLink
        to="/format"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:layout-list" class="text-md shrink-0" />
        <span>{{ $t('hearthstone.format.$self') }}</span>
      </NuxtLink>
    </div>
    <div class="flex flex-col gap-2 justify-start items-center">
      <NuxtLink
        to="/patch"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:git-branch" class="text-md shrink-0" />
        <span>{{ $t('hearthstone.patch.$self') }}</span>
      </NuxtLink>
    </div>
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
