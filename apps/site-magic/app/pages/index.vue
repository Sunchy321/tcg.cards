<template>
  <div class="grid grid-cols-3 gap-4 mt-8">
    <!-- Left column: Advanced search -->
    <div class="flex flex-col gap-2 justify-start items-center">
      <NuxtLink
        to="/search/advanced"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:sliders-horizontal" class="text-md shrink-0" />
        <span>{{ $t('magic.search.advanced.$self') }}</span>
      </NuxtLink>
    </div>
    <div class="flex flex-col gap-2 justify-start items-center">
      <NuxtLink
        to="/format/standard"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:layout-list" class="text-md shrink-0" />
        <span>{{ $t('magic.format.$self') }}</span>
      </NuxtLink>
      <NuxtLink
        to="/set"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:library" class="text-md shrink-0" />
        <span>{{ $t('magic.set.$self') }}</span>
      </NuxtLink>
    </div>
    <div class="flex flex-col gap-2 justify-start items-center">
      <NuxtLink
        to="/document/cr"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:book" class="text-md shrink-0" />
        <span>{{ $t('magic.rule.$self') }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const { setActions } = useActions();
const actionMeta = getMagicActionMeta();
const actions = useMagicActions();

definePageMeta({
  layout:  'entry',
  title:   'Magic: the Gathering',
  actions: [actionMeta.random],
});

const { t } = useI18n();

useTitle(t('magic.$self'));

setActions([actions.random]);
</script>
