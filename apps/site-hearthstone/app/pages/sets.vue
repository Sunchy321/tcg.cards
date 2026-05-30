<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <div class="mb-6">
      <h1 class="text-3xl font-bold">{{ $t('hearthstone.search.advanced.browseSets') }}</h1>
      <p class="mt-2 text-gray-500 dark:text-gray-400">
        {{ $t('hearthstone.search.advanced.browseSetsHint') }}
      </p>
    </div>

    <div class="sets-grid">
      <NuxtLink
        v-for="set in hearthstoneSets"
        :key="set"
        :to="setLink(set)"
        class="set-card"
      >
        <span class="set-name">{{ $t(`hearthstone.set.${set}`) }}</span>
        <span class="set-code">{{ set }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { hearthstoneSets } from '~/utils/hearthstone-sets';

const { t } = useI18n();
const { setActions } = useActions();
const actions = useHearthstoneActions();

definePageMeta({
  layout:    'main',
  titleType: 'input',
  actions:   [getHearthstoneActionMeta().random],
});

useTitle(t('hearthstone.search.advanced.browseSets'));

setActions([actions.random]);

const setLink = (set: string) => ({
  path:  '/search',
  query: { q: `set:${set} order:name+` },
});
</script>

<style scoped>
.sets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
}

.set-card {
  display: flex;
  min-height: 5rem;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 0.5rem;
  border: 1px solid rgb(148 163 184 / 0.32);
  background: rgb(15 23 42 / 0.72);
  padding: 0.9rem;
  color: white;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.set-card:hover {
  border-color: rgb(251 191 36 / 0.7);
  background: rgb(30 41 59 / 0.86);
}

.set-name {
  font-weight: 700;
  line-height: 1.25;
}

.set-code {
  margin-top: 0.75rem;
  color: rgb(148 163 184);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 0.78rem;
}
</style>
