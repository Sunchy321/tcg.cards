<template>
  <div class="flex flex-col gap-8 items-center w-[90%] md:w-[75%] mx-auto mt-8">
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 w-full">
      <a
        v-for="game in games"
        :key="game.id"
        :href="game.url"
        class="flex flex-col items-center gap-3 p-6 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 transition-all hover:scale-105 text-white no-underline"
      >
        <Icon :name="game.icon" :size="48" />
        <span class="font-semibold text-lg">{{ game.name }}</span>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GAMES } from '#shared';

definePageMeta({
  layout: 'entry',
  title:  'TCG Cards',
});

const { t } = useI18n();
const { public: { gameBaseUrls } } = useRuntimeConfig();

const games = GAMES.map(g => ({
  id:   g,
  name: t(`${g}.$self`),
  icon: `i:${g}-logo`,
  url:  gameBaseUrls[g] ?? `https://${g}.tcg.cards`,
}));
</script>
