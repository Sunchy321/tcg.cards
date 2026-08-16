<template>
  <div class="container mx-auto px-4 pt-2 pb-6">
    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="lucide:loader" class="text-2xl animate-spin" />
    </div>

    <div v-else-if="!formatData" class="text-center py-12 text-gray-500">
      {{ $t('hearthstone.formatPage.noData') }}
    </div>

    <div v-else>
      <UCard>
        <div class="space-y-6">
          <div>
            <h1 class="text-2xl font-bold">{{ displayName }}</h1>
            <div v-if="birthday || deathdate" class="mt-1 flex flex-wrap gap-x-4 text-sm text-gray-500">
              <span v-if="birthday">{{ $t('hearthstone.formatPage.birthday') }} · {{ birthday }}</span>
              <span v-if="deathdate">{{ $t('hearthstone.formatPage.deathdate') }} · {{ deathdate }}</span>
            </div>
          </div>

          <div>
            <h2 class="mb-2 text-lg font-semibold">{{ $t('hearthstone.formatPage.inRotation') }}</h2>
            <div v-if="sets.length > 0" class="flex flex-wrap gap-2">
              <UBadge
                v-for="setId in sets"
                :key="setId"
                color="primary"
                variant="subtle"
                size="md"
              >
                {{ setId }}
              </UBadge>
            </div>
            <p v-else class="text-sm text-gray-500">{{ $t('hearthstone.formatPage.emptySets') }}</p>
          </div>

          <div>
            <h2 class="mb-2 text-lg font-semibold">{{ $t('hearthstone.formatPage.banlist') }}</h2>
            <div v-if="banlist.length > 0" class="space-y-1.5">
              <div
                v-for="entry in banlist"
                :key="`${entry.cardId}:${entry.status}`"
                class="flex items-center gap-3 rounded border border-gray-200 px-3 py-1.5 text-sm dark:border-gray-700"
              >
                <NuxtLink
                  :to="`/card/${entry.cardId}`"
                  class="font-medium text-primary hover:opacity-70"
                >
                  {{ entry.cardId }}
                </NuxtLink>
                <UBadge color="neutral" variant="soft" size="sm">
                  {{ statusLabel(entry.status) }}
                </UBadge>
                <span v-if="entry.date" class="text-xs text-gray-500 dark:text-gray-400">{{ entry.date }}</span>
                <span v-if="entry.group" class="text-xs text-gray-500 dark:text-gray-400">{{ entry.group }}</span>
              </div>
            </div>
            <p v-else class="text-sm text-gray-500">{{ $t('hearthstone.formatPage.emptyBanlist') }}</p>
          </div>

          <div v-if="tags.length > 0">
            <h2 class="mb-2 text-lg font-semibold">{{ $t('hearthstone.formatPage.tags') }}</h2>
            <div class="flex flex-wrap gap-2">
              <UBadge v-for="tag in tags" :key="tag" color="neutral" variant="subtle">
                {{ tag }}
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formats } from '#model/hearthstone/schema/basic';

definePageMeta({
  layout: 'main',
  params: [
    { id: 'format', type: 'select' },
    { id: 'view', type: 'switch', icon: 'lucide:clock' },
  ],
});

const { $orpc } = useNuxtApp();
const route = useRoute('format-format');
const router = useRouter();
const gameLocale = useGameLocale();
const { t, te } = useI18n();
const { setParams } = useParams();

const formatId = computed(() => route.params.format as string);

const { data: formatData, pending } = useAsyncData(`format-${formatId.value}`, () => {
  return $orpc.hearthstone.format.get({ formatId: formatId.value });
}, { watch: [formatId] });

// ── Params ────────────────────────────────────────────────────────────────────

const formatLabel = (format: string) => {
  const key = `hearthstone.format.${format}`;
  return te(key) ? t(key) : format;
};

const formatItems = computed(() =>
  formats.map(f => ({ value: f, label: formatLabel(f) })),
);

setParams([
  {
    id:       'format',
    type:     'select',
    items:    formatItems,
    value:    formatId,
    onChange: (val: string) => router.push(`/format/${val}`),
  },
  {
    id:       'view',
    type:     'switch',
    value:    computed(() => false),
    onChange: (val: boolean) => router.push(val ? `/format/${formatId.value}/timeline` : `/format/${formatId.value}`),
  },
]);

// ── Display helpers ───────────────────────────────────────────────────────────

const displayName = computed(() => {
  const loc = formatData.value?.localization?.find(l => l.lang === gameLocale.value)
    ?? formatData.value?.localization?.[0];
  return loc?.name ?? formatLabel(formatId.value);
});

const birthday = computed(() => formatData.value?.birthday ?? null);
const deathdate = computed(() => formatData.value?.deathdate ?? null);
const sets = computed(() => formatData.value?.sets ?? []);
const banlist = computed(() => formatData.value?.banlist ?? []);
const tags = computed(() => formatData.value?.tags ?? []);

const statusLabel = (status: string) => {
  const key = `hearthstone.legality.${status}`;
  return te(key) ? t(key) : status;
};

useTitle(() => displayName.value);
</script>
