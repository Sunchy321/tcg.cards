<template>
  <div class="mx-auto max-w-6xl px-4 py-8">
    <div class="sets-header mb-6">
      <h1 class="sets-title">{{ $t('hearthstone.search.advanced.browseSets') }}</h1>
      <p class="sets-hint">
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
        <span v-if="setIconUrl(set) != null" class="hs-set-icon-tile">
          <img
            :src="setIconUrl(set) ?? ''"
            alt=""
            class="hs-set-icon-image"
            :class="setIconTone(set) === 'mono' ? 'hs-set-icon-image--mono' : 'hs-set-icon-image--color'"
          >
        </span>
        <span class="set-card-name">{{ setName(set) }}</span>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { hearthstoneSets } from '~/utils/hearthstone-sets';
import { hearthstoneSetIconTone, hearthstoneSetIconUrl } from '~/utils/hearthstone-set-icons';

const { t, te } = useI18n();
const { setActions } = useActions();
const actions = useHearthstoneActions();

definePageMeta({
  layout:    'main',
  titleType: 'input',
  actions:   [getHearthstoneActionMeta().random],
});

useTitle(t('hearthstone.search.advanced.browseSets'));

setActions([actions.random]);

// Builds a search link scoped to one Hearthstone set.
const setLink = (set: string) => ({
  path:  '/search',
  query: { q: `set:${set} order:name+` },
});

// Returns the localized set name without exposing internal set ids.
const setName = (set: string) => {
  const key = `hearthstone.set.${set}`;
  return te(key) ? t(key) : '';
};

// Returns the public icon URL for known Hearthstone sets.
const setIconUrl = (set: string) => hearthstoneSetIconUrl(set);

// Returns whether the set icon should be rendered as mono or full color.
const setIconTone = (set: string) => hearthstoneSetIconTone(set);
</script>

<style scoped>
.sets-header {
  color: rgb(58 31 12);
}

.sets-title {
  color: rgb(39 23 10);
  font-size: 1.875rem;
  font-weight: 800;
  line-height: 1.2;
}

.sets-hint {
  margin-top: 0.5rem;
  color: rgb(92 53 18);
  font-size: 0.95rem;
  line-height: 1.5;
}

.sets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr));
  gap: 0.85rem;
}

.set-card {
  display: flex;
  min-height: 5.25rem;
  align-items: center;
  gap: 0.8rem;
  border-radius: 0.5rem;
  border: 1px solid rgb(146 64 14 / 0.2);
  background: rgb(255 244 220 / 0.82);
  padding: 0.85rem 0.95rem;
  color: rgb(52 29 13);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.6),
    0 8px 18px rgb(92 45 9 / 0.08);
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.set-card:hover {
  border-color: rgb(217 119 6 / 0.55);
  background: rgb(255 250 236 / 0.95);
  transform: translateY(-1px);
}

.set-card-name {
  min-width: 0;
  color: inherit;
  font-size: 1.02rem;
  font-weight: 700;
  line-height: 1.3;
}

:global(.dark) .sets-header,
:global(.dark-mode) .sets-header {
  color: rgb(254 243 199);
}

:global(.dark) .sets-title,
:global(.dark-mode) .sets-title,
:global([data-theme="dark"]) .sets-title,
:global([data-color-mode="dark"]) .sets-title {
  color: #ffffff;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.42);
}

:global(.dark) .sets-hint,
:global(.dark-mode) .sets-hint,
:global([data-theme="dark"]) .sets-hint,
:global([data-color-mode="dark"]) .sets-hint {
  color: #ffffff;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.34);
}

:global(.dark) .set-card,
:global(.dark-mode) .set-card {
  border-color: rgb(251 191 36 / 0.2);
  background: rgb(48 33 26 / 0.9);
  color: rgb(255 247 237);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 8px 18px rgb(0 0 0 / 0.18);
}

:global(.dark) .set-card:hover,
:global(.dark-mode) .set-card:hover {
  border-color: rgb(251 191 36 / 0.55);
  background: rgb(62 41 31 / 0.96);
}

</style>
