<template>
  <NuxtLink :to="`/magic/set/${setId}`" class="magic-set-avatar inline-flex items-center gap-1">
    <span class="set-code font-mono text-sm">{{ setId }}</span>
    <span v-if="name" class="set-name">{{ name }}</span>
  </NuxtLink>
</template>

<script setup lang="ts">
import type { SetProfile } from '#model/magic/schema/set';

const props = defineProps<{
  setId: string;
}>();

const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale('magic');

const profile = ref<SetProfile | null>(null);

onMounted(async () => {
  try {
    profile.value = await $orpc.magic.set.profile(props.setId);
  } catch {
    // silently fail
  }
});

watch(() => props.setId, async newId => {
  try {
    profile.value = await $orpc.magic.set.profile(newId);
  } catch {
    profile.value = null;
  }
});

const name = computed(() => {
  if (!profile.value) return null;
  const loc = profile.value.localization;
  return (
    loc.find(l => l.lang === gameLocale.value)?.name
    ?? loc.find(l => l.lang === 'en')?.name
    ?? null
  );
});
</script>

<style scoped>
.magic-set-avatar {
  text-decoration: underline;
  cursor: pointer;
}
</style>
