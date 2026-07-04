<template>
  <div class="grid grid-cols-3 gap-4 mt-8">
    <div class="flex flex-col gap-2 justify-start items-center">
      <NuxtLink
        to="/search?advanced"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:sliders-horizontal" class="text-md shrink-0" />
        <span>{{ $t('hearthstone.search.advanced.$self') }}</span>
      </NuxtLink>
    </div>
    <div class="flex flex-col gap-2 justify-start items-center">
      <button
        type="button"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
        :disabled="randomPending"
        @click="openRandomCard"
      >
        <UIcon
          :name="randomPending ? 'lucide:loader' : 'lucide:shuffle'"
          class="text-md shrink-0"
          :class="{ 'animate-spin': randomPending }"
        />
        <span>{{ $t('hearthstone.home.randomCard') }}</span>
      </button>
      <NuxtLink
        to="/sets"
        class="flex flex-row items-center gap-3 px-1 py-1 w-full rounded-lg ring-1 ring-white/10 text-white bg-white/10 hover:bg-white/20 transition"
      >
        <UIcon name="lucide:library" class="text-md shrink-0" />
        <span>{{ $t('hearthstone.search.advanced.browseSets') }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const { setActions } = useActions();
const actionMeta = getHearthstoneActionMeta();
const actions = useHearthstoneActions();
const { t } = useI18n();

definePageMeta({
  layout:  'entry',
  title:   'Hearthstone',
  actions: [actionMeta.random],
});

useTitle(t('hearthstone.$self'));

setActions([actions.random]);

const randomPending = ref(false);

const openRandomCard = async () => {
  if (randomPending.value) return;

  try {
    randomPending.value = true;
    const cardId = await $fetch<string>('/api/hearthstone/random-card');
    await navigateTo(`/card/${cardId}`);
  } finally {
    randomPending.value = false;
  }
};
</script>
