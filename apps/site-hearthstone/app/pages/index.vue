<template>
  <div class="mx-auto mt-8 grid max-w-5xl gap-4 px-4 sm:grid-cols-2">
    <button
      type="button"
      class="entry-card text-left"
      :disabled="randomPending"
      @click="openRandomCard"
    >
      <span class="entry-icon">
        <UIcon
          :name="randomPending ? 'lucide:loader' : 'lucide:shuffle'"
          class="text-xl shrink-0"
          :class="{ 'animate-spin': randomPending }"
        />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-lg font-semibold">{{ $t('hearthstone.home.randomCard') }}</span>
        <span class="entry-card-muted mt-1 block text-sm">{{ $t('hearthstone.home.randomCardHint') }}</span>
      </span>
    </button>

    <NuxtLink to="/search?advanced" class="entry-card">
      <span class="entry-icon">
        <UIcon name="lucide:sliders-horizontal" class="text-xl shrink-0" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-lg font-semibold">{{ $t('hearthstone.search.advanced.$self') }}</span>
        <span class="entry-card-muted mt-1 block text-sm">{{ $t('hearthstone.search.advanced.entryHint') }}</span>
      </span>
    </NuxtLink>

    <NuxtLink to="/sets" class="entry-card">
      <span class="entry-icon">
        <UIcon name="lucide:library" class="text-xl shrink-0" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-lg font-semibold">{{ $t('hearthstone.search.advanced.browseSets') }}</span>
        <span class="entry-card-muted mt-1 block text-sm">{{ $t('hearthstone.search.advanced.browseSetsHint') }}</span>
      </span>
    </NuxtLink>

    <NuxtLink to="/announcement" class="entry-card">
      <span class="entry-icon">
        <UIcon name="lucide:megaphone" class="text-xl shrink-0" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-lg font-semibold">{{ $t('hearthstone.announcement.$self') }}</span>
        <span class="entry-card-muted mt-1 block text-sm">{{ $t('hearthstone.home.announcementHint') }}</span>
      </span>
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

/** Opens one random card while preventing duplicate requests. */
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
  border: 1px solid var(--color-entry-card-border);
  border-radius: 1rem;
  background: var(--color-entry-card-bg);
  padding: 1rem;
  color: var(--color-entry-card-text);
  box-shadow: 0 18px 50px var(--color-entry-card-shadow);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}

.entry-card:hover {
  border-color: rgb(255 225 165 / 0.46);
  background: var(--color-entry-card-bg-hover);
  transform: translateY(-2px);
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
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-entry-card-border);
  border-radius: 9999px;
  background: var(--color-entry-card-icon-bg);
}
</style>
