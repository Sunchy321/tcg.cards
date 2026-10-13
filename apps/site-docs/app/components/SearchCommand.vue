<template>
  <div class="flex items-center">
    <UButton icon="i-lucide-search" :label="t('search.placeholder')" color="neutral" variant="subtle" class="hidden w-56 justify-start sm:flex" @click="() => { open = true }" />
    <UButton icon="i-lucide-search" color="neutral" variant="ghost" class="sm:hidden" @click="() => { open = true }" />

    <UModal v-model:open="open">
      <template #content>
        <UCommandPalette :groups="groups" :placeholder="t('search.placeholder')" :fuse="{ fuseOptions: { keys: ['label', 'suffix', 'description'] } }" />
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { SearchItem } from '../../lib/search';
import { buildSearchIndex } from '../../lib/search';

const { t, te } = useI18n();
const route = useRoute();
const open = ref(false);

defineShortcuts({
  meta_k: {
    usingInput: true,
    handler:    () => { open.value = !open.value; },
  },
});

/** Scopes search to the current game; the portal (no game segment) searches across all games. */
const currentGame = computed(() => {
  const segment = route.path.split('/')[2];
  return segment === 'magic' || segment === 'hearthstone' ? segment : undefined;
});

const groups = computed(() => {
  const index = buildSearchIndex();
  const resolve = (key: string) => (te(key) ? t(key) : '');
  const toItems = (items: SearchItem[]) => items
    .filter(item => !currentGame.value || item.game === currentGame.value)
    .map(item => ({ ...item, description: resolve(item.descriptionKey) }));
  return [
    { id: 'endpoints', label: t('search.endpoints'), items: toItems(index.endpoints) },
    { id: 'fields', label: t('search.fields'), items: toItems(index.fields) },
    { id: 'enums', label: t('search.enums'), items: toItems(index.enums) },
  ];
});
</script>
