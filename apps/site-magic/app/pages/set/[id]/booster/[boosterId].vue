<template>
  <div class="bg-white dark:bg-neutral-800 text-black dark:text-white rounded-lg p-6">
    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <NuxtLink :to="`/set/${setId}`" class="text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white text-sm">{{ setName }}</NuxtLink>
      <UIcon name="lucide:chevron-right" class="w-3 h-3 text-gray-400" />
      <span class="text-sm font-medium">{{ boosterName }}</span>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="animate-spin w-8 h-8 text-gray-400" />
    </div>

    <template v-else-if="booster">
      <!-- Packs -->
      <section class="mb-8">
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          {{ $t('magic.ui.set.booster_packs') }}
        </h2>
        <div class="border border-black/15 dark:border-white/15 rounded-lg overflow-hidden">
          <div
            v-for="(pack, i) in booster.packs"
            :key="i"
            class="px-4 py-3 flex items-center gap-4"
            :class="{ 'border-t border-black/10 dark:border-white/10': i > 0 }"
          >
            <!-- Ratio bar segment -->
            <div class="w-32 h-3 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden shrink-0">
              <div
                class="h-full bg-primary rounded-full"
                :style="{ width: `${(pack.weight * 100) / booster.totalWeight}%` }"
              />
            </div>
            <span class="text-sm text-gray-600 dark:text-gray-400 w-12 shrink-0">{{ packRatio(pack) }}%</span>

            <!-- Contents avatars -->
            <div class="flex gap-3 flex-wrap">
              <BoosterAvatar
                v-for="c in pack.contents"
                :key="c.type"
                :type="c.type"
                :count="c.count"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- Sheets -->
      <section>
        <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          {{ $t('magic.ui.set.booster_sheets') }}
        </h2>
        <div class="space-y-2">
          <div
            v-for="sheet in booster.sheets"
            :key="sheet.typeId"
            class="border border-black/15 dark:border-white/15 rounded-lg overflow-hidden"
          >
            <!-- Sheet header / toggle -->
            <button
              class="w-full flex items-center gap-2 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
              @click="toggleSheet(sheet.typeId)"
            >
              <UIcon
                :name="openSheets[sheet.typeId] ? 'lucide:chevron-down' : 'lucide:chevron-right'"
                class="w-4 h-4 text-gray-400 shrink-0"
              />
              <span class="font-medium text-sm">{{ localizeType(sheet.typeId) }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">({{ sheet.cards.length }})</span>
              <span v-if="sheet.isFoil" class="ml-2 text-xs text-yellow-600 font-medium">✦ Foil</span>
              <span v-if="sheet.isFixed" class="ml-2 text-xs text-blue-600 font-medium">Fixed</span>
            </button>

            <!-- Card grid -->
            <div v-if="openSheets[sheet.typeId]" class="p-3 border-t border-black/10 dark:border-white/10">
              <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))">
                <NuxtLink
                  v-for="card in sheet.cards"
                  :key="`${card.set}-${card.number}`"
                  :to="`/card/${card.cardId}`"
                  class="group relative"
                >
                  <img
                    :src="cardImageUrl(card)"
                    :alt="card.cardId"
                    class="w-full rounded-lg shadow-sm group-hover:shadow-md transition-shadow"
                    loading="lazy"
                    @error="(e) => ((e.target as HTMLImageElement).src = '/card-not-found.svg')"
                  >
                  <!-- Weight badge if non-uniform -->
                  <span
                    v-if="!uniformWeight(sheet)"
                    class="absolute top-1 right-1 text-xs bg-black/60 text-white px-1 rounded"
                  >{{ card.weight }}</span>
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <div v-else class="text-gray-500 py-8 text-center">
      {{ $t('magic.ui.set.booster_not_found') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Set, Booster } from '#model/magic/schema/set';

const route = useRoute('set-id-booster-boosterId');
const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale();
const { public: { assetBaseUrl } } = useRuntimeConfig();
const { t, te } = useI18n();

// ── Params ────────────────────────────────────────────────────────────────────

const setId = computed(() => route.params.id as string);
const boosterId = computed(() => route.params.boosterId as string);

// ── Data ──────────────────────────────────────────────────────────────────────

const loading = ref(false);
const data = ref<Set | null>(null);

const setName = computed(() => {
  if (!data.value) return setId.value;
  const locs = data.value.localization;
  return (
    locs.find(l => l.lang === gameLocale.value)?.name
    ?? locs.find(l => l.lang === 'en')?.name
    ?? setId.value
  );
});

const booster = computed<Booster | null>(
  () => data.value?.boosters?.find(b => b.boosterId === boosterId.value) ?? null,
);

const boosterName = computed(() => {
  const key = `magic.set.booster.name.${boosterId.value}`;
  if (te(key)) return t(key);
  if (te(key, 'en')) return t(key, 'en' as any);
  return boosterId.value;
});

useTitle(() => `${boosterName.value} – ${setName.value}`);

// ── Sheets toggles ────────────────────────────────────────────────────────────

const openSheets = ref<Record<string, boolean>>({});

const toggleSheet = (typeId: string) => {
  openSheets.value[typeId] = !(openSheets.value[typeId] ?? false);
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const localizeType = (typeId: string) => {
  const key = `magic.set.booster.type.${typeId}`;
  if (te(key)) return t(key);
  if (te(key, 'en')) return t(key, 'en' as any);
  return typeId;
};

const packRatio = (pack: Booster['packs'][0]) => {
  if (!booster.value) return 0;
  let rate = 10;
  do {
    const ratio = Math.round((pack.weight * rate * 100) / booster.value.totalWeight) / rate;
    if (ratio > 0) return ratio;
    rate *= 10;
  } while (rate < 1_000_000);
  return 0;
};

const cardImageUrl = (card: Booster['sheets'][0]['cards'][0]) => {
  const lang = card.lang ?? 'en';
  return `${assetBaseUrl}/magic/card/large/${card.set}/${lang}/${card.number}.jpg`;
};

const uniformWeight = (sheet: Booster['sheets'][0]) => {
  if (sheet.cards.length === 0) return true;
  const w = sheet.cards[0]!.weight;
  return sheet.cards.every(c => c.weight === w);
};

// ── Load ──────────────────────────────────────────────────────────────────────

const load = async (id: string) => {
  loading.value = true;
  data.value = null;
  try {
    data.value = await $orpc.magic.set.complete({ setId: id });
  } catch {
    data.value = null;
  } finally {
    loading.value = false;
  }
};

watch(setId, load, { immediate: true });

definePageMeta({ layout: 'main' });
</script>
