<template>
  <NuxtLink
    :to="`/card/${cardId}?version=${version}`"
    class="hs-card-avatar hover:underline text-primary"
  >
    <span>{{ displayName }}</span>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { CardProfile } from '#model/hearthstone/schema/card';

const props = withDefaults(defineProps<{
  cardId:   string;
  version?: number;
}>(), {
  version: undefined,
});

const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale();

const profile = ref<CardProfile | null>(null);

watchEffect(async () => {
  try {
    profile.value = await $orpc.hearthstone.card.profile(props.cardId);
  } catch {
    profile.value = null;
  }
});

const displayName = computed(() => {
  if (!profile.value) return props.cardId;
  const loc = profile.value.localization.find(l => l.lang === gameLocale.value)
    ?? profile.value.localization[0];
  return loc?.name ?? props.cardId;
});
</script>
