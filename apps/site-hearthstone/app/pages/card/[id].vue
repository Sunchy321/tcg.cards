<template>
  <div class="container mx-auto px-4 py-6">
    <div v-if="data" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Left column: Card image -->
      <div class="lg:col-span-3">
        <div class="sticky top-24">
          <UCard>
            <CardImage
              :card-id="data.cardId"
              :version="minVersion"
              :variant="variant"
            />

            <div class="mt-4">
              <USelect
                v-model="variant"
                :items="variantOptions"
                size="sm"
              />
            </div>

            <div v-if="data.artist" class="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {{ data.artist }}
            </div>

            <div class="mt-4 flex gap-2">
              <UButton
                v-if="jsonLink"
                class="flex-1"
                size="sm"
                variant="outline"
                :to="jsonLink"
                target="_blank"
                icon="lucide:braces"
              >
                JSON
              </UButton>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Middle column: Card details -->
      <div class="lg:col-span-6">
        <UCard>
          <!-- Name + Cost -->
          <div class="flex items-center justify-between gap-2 mb-2">
            <h1 class="text-3xl font-bold">{{ data.localization.name }}</h1>
            <div v-if="data.cost != null" class="text-2xl font-bold shrink-0 bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center shadow">
              {{ data.cost }}
            </div>
          </div>

          <!-- Type + Race + Stats -->
          <div class="flex items-center gap-2 py-2 my-4 bg-gray-50 dark:bg-gray-800 px-3 rounded">
            <span class="font-medium flex-1">
              {{ $t(`hearthstone.card.type.${data.type}`) }}
              <template v-if="data.race && data.race.length > 0">
                ·
                <span v-for="(r, i) in data.race" :key="r">
                  {{ $t(`hearthstone.card.race.${r}`) }}<span v-if="i < data.race.length - 1">/</span>
                </span>
              </template>
              <template v-if="data.spellSchool">
                · {{ $t(`hearthstone.card.spellSchool.${data.spellSchool}`) }}
              </template>
            </span>
            <span v-if="stats" class="font-medium shrink-0">{{ stats }}</span>
          </div>

          <!-- Card text -->
          <div v-if="data.localization.displayText" class="border-l-2 border-primary bg-gray-50 dark:bg-gray-800 rounded-r-lg p-4 mb-6 leading-relaxed">
            <RichText>{{ data.localization.displayText }}</RichText>
          </div>

          <!-- Flavor text -->
          <div v-if="data.localization.flavorText" class="border-l-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 italic text-gray-500 dark:text-gray-400 rounded-r-lg p-4 mb-6">
            {{ data.localization.flavorText }}
          </div>

          <!-- Mechanics + Referenced tags -->
          <div v-if="mechanics.length > 0 || referencedTags.length > 0" class="flex flex-wrap gap-2 mb-6">
            <UBadge
              v-for="m in mechanics"
              :key="m"
              color="primary"
              variant="subtle"
              class="cursor-pointer"
              @click="copyTag(m)"
            >
              {{ mechanicText(m) }}
            </UBadge>
            <UBadge
              v-for="r in referencedTags"
              :key="r"
              color="neutral"
              variant="subtle"
              class="cursor-pointer"
              @click="copyTag(r)"
            >
              {{ mechanicText(r) }}
            </UBadge>
          </div>

          <!-- Related cards -->
          <div v-if="data.relatedCards.length > 0" class="border rounded-lg divide-y mb-6">
            <div
              v-for="rel in data.relatedCards"
              :key="rel.cardId"
              class="flex items-center gap-2 px-3 py-2"
            >
              <UIcon :name="relationIcon(rel.relation)" class="shrink-0 text-gray-400" />
              <CardAvatar :card-id="rel.cardId" :version="rel.version[0]" />
            </div>
          </div>

          <!-- Legalities -->
          <div v-if="legalityEntries.length > 0" class="grid grid-cols-2 gap-x-4 gap-y-1 mb-6 text-sm">
            <div
              v-for="[fmt, status] in legalityEntries"
              :key="fmt"
              class="flex items-center justify-between gap-2"
            >
              <span class="text-gray-500 dark:text-gray-400 truncate min-w-0">
                {{ $te(`hearthstone.format.${fmt}`) ? $t(`hearthstone.format.${fmt}`) : fmt }}
              </span>
              <span
                class="font-medium shrink-0 text-xs"
                :class="legalityColor(status)"
              >{{ $t(`hearthstone.legality.${status}`) }}</span>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Right column: Versions -->
      <div class="lg:col-span-3">
        <div class="sticky top-24">
          <UCard>
            <h2 class="text-xl font-semibold mb-4">{{ $t('hearthstone.card.versions') }}</h2>

            <div class="divide-y">
              <div
                v-for="v in versionInfos"
                :key="v.versions[0]"
                class="py-2 first:pt-0 cursor-pointer hover:opacity-70 flex items-center gap-2"
                @click="version = v.versions[0]!"
              >
                <div
                  class="w-2.5 h-2.5 rounded-full shrink-0 border"
                  :class="v.versions.includes(version)
                    ? 'bg-primary border-primary'
                    : 'bg-white dark:bg-gray-900 border-gray-400'"
                />
                <div>
                  <div :class="v.versions.includes(version) ? 'text-primary font-semibold' : ''">
                    {{ v.firstName }}
                  </div>
                  <div v-if="v.versions.length > 1 && v.lastName !== v.firstName" class="text-xs text-gray-500 dark:text-gray-400">
                    ~ {{ v.lastName }}
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-else-if="status === 'pending'" class="flex justify-center py-24">
      <UIcon name="lucide:loader" class="animate-spin text-4xl text-gray-400" />
    </div>

    <!-- Error state -->
    <div v-else class="flex flex-col items-center py-24 text-gray-400 gap-4">
      <UIcon name="lucide:frown" class="text-5xl" />
      <p>{{ $t('hearthstone.card.notFound') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { last } from 'lodash-es';

import { locale as localeSchema, type Locale } from '#model/hearthstone/schema/basic';
import type { Patch } from '#model/hearthstone/schema/patch';

const { $orpc } = useNuxtApp();
const route = useRoute('card-id');
const router = useRouter();
const gameLocale = useGameLocale();
const { setActions } = useActions();
const actionMeta = getHearthstoneActionMeta();
const actions = useHearthstoneActions();
const { t, te } = useI18n();

definePageMeta({
  layout:    'main',
  titleType: 'input',
  actions:   [actionMeta.random],
});

setActions([actions.random]);

// ─── Language ────────────────────────────────────────────────────────────────

const lang = computed({
  get: (): Locale => localeSchema.safeParse(route.query.lang as string).data ?? gameLocale.value as Locale,
  set: (v: Locale) => { void router.replace({ query: { ...route.query, lang: v } }); },
});

// ─── Data fetching ────────────────────────────────────────────────────────────

const query = computed(() => ({
  cardId:  route.params.id as string,
  lang:    lang.value,
  version: route.query.version != null
    ? Number.parseInt(route.query.version as string, 10)
    : undefined,
}));

const asyncDataKey = () => [
  'hearthstone-card',
  query.value.cardId,
  query.value.lang,
  query.value.version ?? '',
].join(':');

const { data, status } = await useAsyncData(
  asyncDataKey,
  () => $orpc.hearthstone.card.full(query.value),
  { watch: [query] },
);

useTitle(() => data.value?.localization.name ?? '');

// ─── Version ─────────────────────────────────────────────────────────────────

const versions = computed(() => data.value?.versions ?? []);

const version = computed({
  get() {
    const queryVersion = Number.parseInt(route.query.version as string, 10);

    if (!Number.isNaN(queryVersion)) {
      if (data.value == null || versions.value.some(v => v.includes(queryVersion))) {
        return queryVersion;
      }
    }

    if (data.value != null) {
      const lastVersion = Math.max(...data.value.version);
      const lastGroup = versions.value.find(v => v.includes(lastVersion)) ?? [];
      return lastGroup[0] ?? 0;
    }

    return 0;
  },
  set(newValue: number) {
    void router.replace({ query: { ...route.query, version: newValue } });
  },
});

const minVersion = computed(() => Math.min(...(data.value?.version ?? [0])));

// ─── Patch profiles ───────────────────────────────────────────────────────────

const patchProfiles = ref<Record<number, Patch>>({});

watch(versions, async values => {
  patchProfiles.value = {};

  await Promise.all(values.flatMap(group => {
    const numbers = [group[0]!, last(group)!].filter((v, i, a) => a.indexOf(v) === i);
    return numbers.map(async n => {
      try {
        const p = await $orpc.hearthstone.patch.full({ buildNumber: n });
        if (p) patchProfiles.value[n] = p;
      } catch {
        // patch info unavailable
      }
    });
  }));
}, { immediate: true });

const versionInfos = computed(() => versions.value.map(v => {
  const first = v[0]!;
  const lastV = last(v)!;

  const firstName = (n: number) => {
    const p = patchProfiles.value[n];
    return p?.shortName ? `${p.shortName} (${n})` : `${n}`;
  };

  return {
    versions:  v,
    firstName: firstName(first),
    lastName:  firstName(lastV),
  };
}));

// ─── Stats ───────────────────────────────────────────────────────────────────

const stats = computed(() => {
  const c = data.value;
  if (c == null) return null;
  if (c.attack != null && c.health != null) return `${c.attack}/${c.health}`;
  if (c.attack != null && c.durability != null) return `${c.attack}/${c.durability}`;
  if (c.armor != null) return `[${c.armor}]`;
  if (c.colddown != null) return `#${c.colddown}`;
  return null;
});

// ─── Mechanics / Tags ─────────────────────────────────────────────────────────

const mechanicEntries = computed(() =>
  Object.entries(data.value?.mechanics ?? {}),
);

const mechanics = computed(() =>
  mechanicEntries.value
    .filter(([key]) => !key.startsWith('?'))
    .map(([key, value]) => value === true ? key : `${key}:${value}`),
);

const referencedTags = computed(() =>
  (data.value?.referencedTags ?? []).filter(v => !v.startsWith('?')),
);

const hasMechanic = (key: string) =>
  mechanicEntries.value.some(([name, value]) => name === key && value === true);

const mechanicText = (m: string) => {
  if (m.includes(':')) {
    const sep = m.indexOf(':');
    const mid = m.slice(0, sep);
    const arg = m.slice(sep + 1);
    const key = `hearthstone.tag.${mid}`;
    return `${te(key) ? t(key) : mid}:${arg}`;
  }
  const key = `hearthstone.tag.${m}`;
  return te(key) ? t(key) : m;
};

const toast = useToast();

const copyTag = async (tag: string) => {
  const tagName = /^[^:]+(:|$)/.exec(tag)![0]!;
  try {
    await navigator.clipboard.writeText(tagName);
    toast.add({ title: t('hearthstone.card.tagCopied'), color: 'success' });
  } catch {
    // clipboard not available
  }
};

// ─── Legalities ───────────────────────────────────────────────────────────────

const legalityEntries = computed(() =>
  Object.entries(data.value?.legalities ?? {}),
);

const legalityColor = (status: string) => ({
  legal:      'text-green-500',
  banned:     'text-red-500',
  restricted: 'text-yellow-500',
}[status] ?? 'text-gray-500');

// ─── Variant ─────────────────────────────────────────────────────────────────

const variant = ref('normal');

const hasTechLevel = computed(() => data.value?.techLevel != null);

const variantOptions = computed(() => {
  const opts = [
    { label: t('hearthstone.card.variant.normal'), value: 'normal' },
    { label: t('hearthstone.card.variant.golden'), value: 'golden' },
  ];

  if (hasMechanic('has_diamond')) {
    opts.push({ label: t('hearthstone.card.variant.diamond'), value: 'diamond' });
  }
  if (hasMechanic('has_signature')) {
    opts.push({ label: t('hearthstone.card.variant.signature'), value: 'signature' });
  }
  if (hasTechLevel.value) {
    opts.push({ label: t('hearthstone.card.variant.battlegrounds'), value: 'battlegrounds' });
  }

  return opts;
});

watch(hasTechLevel, v => {
  if (!v) variant.value = 'normal';
}, { immediate: true });

// ─── Links ────────────────────────────────────────────────────────────────────

const { public: { assetBaseUrl } } = useRuntimeConfig();

const jsonLink = computed(() => {
  if (!data.value) return undefined;
  const params = new URLSearchParams({
    cardId: data.value.cardId,
    lang:   lang.value,
  });
  if (version.value) params.set('version', String(version.value));
  return `/rpc/hearthstone/card/get?${params.toString()}`;
});

// ─── Relation icon ────────────────────────────────────────────────────────────

const relationIcon = (relation: string): string => ({
  emblem:         'lucide:shield',
  intext:         'lucide:search',
  meld:           'lucide:git-merge',
  specialization: 'lucide:git-fork',
  spellbook:      'lucide:book',
  source:         'lucide:list-tree',
  stick_on:       'lucide:layers',
  token:          'lucide:square',
} as Record<string, string>)[relation] ?? 'lucide:copy';
</script>
