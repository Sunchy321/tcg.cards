<template>
  <div class="grid grid-cols-3 gap-4 mt-8">
    <div />
    <div class="flex justify-center">
      <NuxtLink
        to="/format/standard"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:layout-list" class="text-md shrink-0" />
        <span>{{ $t('magic.format.$self') }}</span>
      </NuxtLink>
    </div>
    <div />
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

setActions([actions.random]);
</script>
