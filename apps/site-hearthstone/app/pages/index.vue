<template>
  <div class="mx-auto mt-8 grid max-w-5xl gap-4 px-4 md:grid-cols-3">
    <button
      type="button"
      class="entry-card text-left"
      :disabled="randomPending"
      @click="openRandomCard"
    >
      <div class="entry-icon">
        <UIcon
          :name="randomPending ? 'lucide:loader' : 'lucide:shuffle'"
          class="text-xl shrink-0"
          :class="{ 'animate-spin': randomPending }"
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="text-lg font-semibold">{{ $t('hearthstone.home.randomCard') }}</div>
        <div class="text-sm text-white/70">{{ $t('hearthstone.home.randomCardHint') }}</div>
      </div>
    </button>

    <NuxtLink
      to="/search/advanced"
      class="entry-card"
    >
      <div class="entry-icon">
        <UIcon name="lucide:sliders-horizontal" class="text-xl shrink-0" />
      </div>

      <div class="min-w-0 flex-1">
        <div class="text-lg font-semibold">{{ $t('hearthstone.search.advanced.$self') }}</div>
        <div class="text-sm text-white/70">{{ $t('hearthstone.search.advanced.entryHint') }}</div>
      </div>
    </NuxtLink>

    <NuxtLink
      to="/sets"
      class="entry-card"
    >
      <div class="entry-icon">
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

<style scoped>
.entry-card {
  display: flex;
  min-height: 9.5rem;
  width: 100%;
  align-items: center;
  gap: 1rem;
  border-radius: 1rem;
  border: 1px solid rgb(255 255 255 / 0.1);
  background: rgb(255 255 255 / 0.1);
  padding: 1rem;
  color: white;
  transition: background 0.2s ease;
}

.entry-card:hover {
  background: rgb(255 255 255 / 0.16);
}

.entry-card:disabled {
  cursor: progress;
  opacity: 0.8;
}

.entry-icon {
  display: flex;
  width: 3rem;
  height: 3rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.1);
}
</style>
