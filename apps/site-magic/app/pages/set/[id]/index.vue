<template>
  <div class="bg-white dark:bg-neutral-800 text-black dark:text-white rounded-lg p-6">
    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="animate-spin w-8 h-8 text-gray-500" />
    </div>

    <template v-else-if="data">
      <!-- Rarities -->
      <div class="flex flex-wrap items-center gap-4 mb-6">
        <div
          v-for="r in rarities"
          :key="r"
          class="flex flex-col items-center gap-1"
        >
          <img :src="rarityIconUrl(r)" class="w-10 h-10 object-contain">
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ $t('magic.rarity.' + r) }}</span>
        </div>
        <div class="flex gap-1 ml-auto">
          <UButton
            v-if="wotcLink"
            :to="wotcLink"
            target="_blank"
            icon="lucide:link"
            variant="ghost"
            color="neutral"
            size="sm"
          />
          <UButton
            :to="apiLink"
            target="_blank"
            icon="lucide:braces"
            variant="ghost"
            color="neutral"
            size="sm"
          />
        </div>
      </div>

      <!-- Languages -->
      <div v-if="langs.length > 0" class="flex flex-wrap gap-1 mb-6">
        <span
          v-for="l in langs"
          :key="l"
          class="px-2 py-0.5 text-xs font-mono ring-1 ring-black/20 dark:ring-white/20 rounded"
        >
          {{ l }}
        </span>
      </div>

      <!-- Card count + search link -->
      <div class="flex items-center gap-2 mb-6">
        <UButton
          :to="{ path: '/search', query: { q: `s:${id}` } }"
          icon="lucide:layers"
          variant="ghost"
          color="neutral"
          size="sm"
        />
        <span class="text-sm text-gray-600 dark:text-gray-400">{{ cardCount }} {{ $t('magic.ui.set.cards') }}</span>
      </div>

      <!-- Meta info -->
      <UCard class="mb-6">
        <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div v-if="data.releaseDate" class="flex gap-2">
            <span class="text-gray-500 dark:text-gray-400">{{ $t('magic.ui.set.releaseDate') }}</span>
            <span class="font-mono">{{ data.releaseDate }}</span>
          </div>
          <div v-if="data.type" class="flex gap-2">
            <span class="text-gray-500 dark:text-gray-400">{{ $t('magic.ui.set.type') }}</span>
            <span>{{ data.type }}</span>
          </div>
          <div v-if="data.block" class="flex gap-2">
            <span class="text-gray-500 dark:text-gray-400">{{ $t('magic.ui.set.block') }}</span>
            <span>{{ data.block }}</span>
          </div>
          <div v-if="data.parent" class="flex gap-2">
            <span class="text-gray-500 dark:text-gray-400">{{ $t('magic.ui.set.parent') }}</span>
            <NuxtLink :to="`/set/${data.parent}`" class="text-primary underline">{{ data.parent }}</NuxtLink>
          </div>
          <div v-if="data.scryfallCode" class="flex gap-2">
            <span class="text-gray-500 dark:text-gray-400">Scryfall</span>
            <a
              :href="`https://scryfall.com/sets/${data.scryfallCode}`"
              target="_blank"
              class="font-mono underline text-primary"
            >{{ data.scryfallCode }}</a>
          </div>
        </div>
      </UCard>

      <!-- Boosters -->
      <div v-if="boosters && boosters.length > 0">
        <h2 class="text-lg font-semibold mb-4">
          {{ $t('magic.ui.set.booster') }}
        </h2>
        <div class="space-y-3">
          <BoosterSummary
            v-for="b in boosters"
            :key="b.boosterId"
            :set-id="id"
            :booster="b"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Set } from '#model/magic/schema/set';

const route = useRoute('set-id');
const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale();
const { public: { assetBaseUrl } } = useRuntimeConfig();

// ── Route param ───────────────────────────────────────────────────────────────

const id = computed(() => route.params.id as string);

// ── Data ──────────────────────────────────────────────────────────────────────

const loading = ref(false);
const data = ref<Set | null>(null);

// ── Computed ──────────────────────────────────────────────────────────────────

const name = computed(() => {
  if (!data.value) return null;
  const locs = data.value.localization;
  return (
    locs.find(l => l.lang === gameLocale.value)?.name
    ?? locs.find(l => l.lang === 'en')?.name
    ?? null
  );
});

useTitle(() => name.value ?? id.value);

const wotcLink = computed(() => {
  if (!data.value) return null;
  const locs = data.value.localization;
  return (
    locs.find(l => l.lang === gameLocale.value)?.link
    ?? locs.find(l => l.lang === 'en')?.link
    ?? null
  );
});

const apiLink = computed(() =>
  `/api/magic/set?setId=${id.value}`,
);

const rarities = computed(() => data.value?.rarities ?? []);
const langs = computed(() => data.value?.langs ?? []);
const cardCount = computed(() => data.value?.cardCount ?? 0);
const boosters = computed(() => data.value?.boosters ?? []);

const rarityIconUrl = (rarity: string) => {
  const iconSet = (data.value?.parent != null && ['promo', 'token', 'memorabilia', 'funny'].includes(data.value?.type))
    ? data.value.parent
    : id.value;

  return `${assetBaseUrl}/magic/set/icon/${iconSet}/${rarity}.svg`;
};

// ── Load ──────────────────────────────────────────────────────────────────────

const load = async (setId: string) => {
  loading.value = true;
  data.value = null;

  try {
    data.value = await $orpc.magic.set.complete({ setId });
  } catch {
    data.value = null;
  } finally {
    loading.value = false;
  }
};

watch(id, load, { immediate: true });

definePageMeta({
  layout: 'main',
});
</script>
