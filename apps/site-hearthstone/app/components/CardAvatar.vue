<template>
  <NuxtLink
    :to="cardLink"
    class="hs-card-avatar hover:underline text-primary"
  >
    <span>{{ displayName }}</span>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { Locale } from '#model/hearthstone/schema/basic';
import type { CardProfile } from '#model/hearthstone/schema/card';

const props = withDefaults(defineProps<{
  cardId:   string;
  version?: number;
  lang?:    Locale;
}>(), {
  version: undefined,
  lang:    undefined,
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
  const displayLang = props.lang ?? gameLocale.value;
  const loc = profile.value.localization.find(l => l.lang === displayLang)
    ?? profile.value.localization[0];
  return loc?.name ?? props.cardId;
});

const cardLink = computed(() => ({
  path:  `/card/${props.cardId}`,
  query: {
    ...(props.version != null ? { version: props.version } : {}),
    ...(props.lang != null ? { lang: props.lang } : {}),
  },
}));
</script>
