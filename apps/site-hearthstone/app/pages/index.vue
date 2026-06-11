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
        <div class="entry-card-muted text-sm">{{ $t('hearthstone.home.randomCardHint') }}</div>
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
        <div class="entry-card-muted text-sm">{{ $t('hearthstone.search.advanced.entryHint') }}</div>
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
        <div class="entry-card-muted text-sm">{{ $t('hearthstone.search.advanced.browseSetsHint') }}</div>
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

// Opens a random Hearthstone card while preventing duplicate requests.
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
  border: 1px solid var(--color-entry-card-border);
  background: var(--color-entry-card-bg);
  padding: 1rem;
  color: var(--color-entry-card-text);
  box-shadow: 0 18px 50px var(--color-entry-card-shadow);
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.entry-card:hover {
  background: var(--color-entry-card-bg-hover);
  transform: translateY(-1px);
}

.entry-card:disabled {
  cursor: progress;
  opacity: 0.8;
}

.entry-card-muted {
  color: var(--color-entry-card-muted);
}

.entry-icon {
  display: flex;
  width: 3rem;
  height: 3rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: var(--color-entry-card-icon-bg);
}
</style>
