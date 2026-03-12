<template>
  <div class="container mx-auto">
    <div v-if="data" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Left column: Card image -->
      <div class="lg:col-span-3">
        <div class="sticky top-24">
          <UCard>
            <CardImage
              :lang="imageLang"
              :set="data.set"
              :number="data.number"
              :part="partIndex"
              :layout="data.print.layout"
              :full-image-type="data.print.fullImageType"
              :image-status="data.print.imageStatus"
              :rotate="rotate"
              @update:part="partIndex = $event"
              @update:rotate="rotate = $event"
            />
            <div class="mt-4 space-y-2">
              <UButton
                v-if="scryfallLink"
                class="w-full"
                variant="outline"
                :to="scryfallLink"
                target="_blank"
              >
                <template #leading>
                  <img src="/scryfall.svg" class="w-4 h-4" style="filter: drop-shadow(0 0 1px rgba(0,0,0,0.8))">
                </template>
                Scryfall
              </UButton>
              <UButton
                v-if="gathererLink"
                class="w-full"
                variant="outline"
                :to="gathererLink"
                target="_blank"
              >
                <template #leading>
                  <img src="/gatherer.svg" class="w-4 h-4" style="filter: drop-shadow(0 0 1px rgba(0,0,0,0.8))">
                </template>
                Gatherer
              </UButton>
              <UButton
                class="w-full"
                variant="outline"
                :to="mtgchLink"
                target="_blank"
              >
                <template #leading>
                  <img src="/mtgch.svg" class="w-4 h-4 dark:invert">
                </template>
                mtgch
              </UButton>
              <div class="flex gap-2">
                <UButton
                  class="flex-1"
                  size="sm"
                  variant="outline"
                  :to="jsonCardLink"
                  target="_blank"
                  icon="lucide:braces"
                >
                  Card JSON
                </UButton>
                <UButton
                  class="flex-1"
                  size="sm"
                  variant="outline"
                  :to="jsonPrintLink"
                  target="_blank"
                  icon="lucide:braces"
                >
                  Print JSON
                </UButton>
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Middle column: Card details -->
      <div class="lg:col-span-6">
        <UCard>
          <div class="flex items-center justify-between gap-2 mb-2" :style="effectStyle">
            <div class="flex items-center gap-2">
              <button
                v-if="partIcon != null"
                class="shrink-0 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                :class="partIcon.class"
                @click="switchPart"
              >
                <img :src="partIcon.src" class="w-6 h-6">
              </button>
              <img v-if="isArenaVariant" src="/arena.svg" class="w-5 h-5 shrink-0">
              <h1 class="text-3xl font-bold" :class="data.printPart.flavorName != null ? 'text-gray-500 dark:text-gray-400 italic' : ''">
                {{ data.printPart.flavorName ?? displayPart.name }}
              </h1>
            </div>
            <div v-if="data.cardPart.cost" class="flex items-center gap-0.5 shrink-0 text-2xl">
              <Symbol
                v-for="(s, i) in data.cardPart.cost"
                :key="i"
                :value="`{${s}}`"
                :type="['cost']"
              />
            </div>
          </div>
          <div class="flex items-center justify-between gap-2 mb-4" :style="effectStyle">
            <p class="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <span v-if="data.printPart.flavorName != null">{{ displayPart.name }}</span>
              <span
                v-if="textMode !== 'oracle'"
                class="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded px-1"
              >{{ data.cardPart.name }}</span>
            </p>
            <div class="flex shrink-0">
              <UButton
                size="xs"
                :variant="textMode === 'oracle' ? 'solid' : 'outline'"
                class="rounded-r-none"
                @click="textMode = 'oracle'"
              >
                Oracle
              </UButton>
              <UButton
                size="xs"
                :variant="textMode === 'unified' ? 'solid' : 'outline'"
                class="rounded-none border-x-0"
                @click="textMode = 'unified'"
              >
                Unified
              </UButton>
              <UButton
                size="xs"
                :variant="textMode === 'printed' ? 'solid' : 'outline'"
                class="rounded-l-none"
                @click="textMode = 'printed'"
              >
                Printed
              </UButton>
            </div>
          </div>

          <div class="flex items-center gap-2 py-2 my-4 bg-gray-50 dark:bg-gray-800 px-3 rounded" :style="effectStyle">
            <ColorIndicator
              v-if="data.cardPart.colorIndicator"
              :value="data.cardPart.colorIndicator"
            />
            <span class="font-medium flex-1">{{ displayPart.typeline }}</span>
            <span v-if="stats != null" class="font-medium shrink-0">{{ stats }}</span>
          </div>

          <div class="border-l-2 border-primary bg-gray-50 dark:bg-gray-800 rounded-r-lg p-4 mb-6 leading-relaxed space-y-2" :style="effectStyle">
            <RichText>
              {{ displayPart.text }}
            </RichText>
          </div>

          <div v-if="data.printPart.attractionLights != null" class="flex gap-1 mb-6">
            <div
              v-for="i in 6"
              :key="i"
              class="inline-flex items-center justify-center w-6 h-6 rounded-full border-2 border-white text-xs font-bold shadow"
              :style="attractionLightStyle(i, data.printPart.attractionLights)"
            >
              {{ i }}
            </div>
          </div>

          <div v-if="data.printPart.flavorText" class="border-l-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 italic text-gray-500 dark:text-gray-400 rounded-r-lg p-4 mb-6" :style="effectStyle">
            <RichText detect-emph>
              {{ data.printPart.flavorText }}
            </RichText>
          </div>

          <div v-if="tags.length + printTags.length > 0" class="flex flex-wrap gap-2 mb-6">
            <UBadge
              v-for="t in tags"
              :key="t"
              color="primary"
              variant="subtle"
            >
              {{ t }}
            </UBadge>
            <UBadge
              v-for="t in printTags"
              :key="'print-' + t"
              color="secondary"
              variant="subtle"
            >
              {{ t }}
            </UBadge>
          </div>

          <div v-if="legalityEntries.length > 0" class="grid grid-cols-2 gap-x-4 gap-y-1 mb-6 text-sm">
            <div
              v-for="[fmt, status] in legalityEntries"
              :key="fmt"
              class="flex items-center justify-between gap-2"
            >
              <span class="text-gray-500 dark:text-gray-400 truncate min-w-0">{{ $te(`magic.format.${fmt}`) ? $t(`magic.format.${fmt}`) : fmt }}</span>
              <BanlistStatus :status="status" align="right" />
            </div>
          </div>

          <div v-if="data.relatedCards.length > 0" class="border rounded-lg divide-y mb-6">
            <div
              v-for="r in data.relatedCards"
              :key="r.cardId"
              class="flex items-center gap-2 px-3 py-2"
            >
              <UIcon :name="relationIcon(r.relation)" class="shrink-0 text-gray-400" />
              <CardAvatar :id="r.cardId" :version="r.version" />
            </div>
          </div>

          <div v-if="data.rulings.length > 0" class="space-y-3 mb-6">
            <div
              v-for="(ruling, i) in data.rulings"
              :key="i"
              class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3"
            >
              <div class="text-xs text-gray-400 mb-1">
                {{ ruling.source }} · {{ ruling.date }}
              </div>
              <div class="text-sm text-gray-800 dark:text-gray-200">
                <RichText detect-url>
                  {{ ruling.text }}
                </RichText>
              </div>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Right column: Card printing information -->
      <div class="lg:col-span-3">
        <div class="sticky top-24">
          <UCard>
            <h2 class="text-xl font-semibold mb-4">
              Versions
            </h2>

            <div class="space-y-4">
              <!-- Locale/lang row -->
              <div class="flex flex-wrap gap-1 border-b pb-4">
                <div
                  v-for="lv in uniqueLocales"
                  :key="`${lv.locale}-${lv.lang}`"
                  class="flex cursor-pointer gap-1 transition-opacity"
                  :class="lv.locale === data.locale
                    ? 'opacity-100 hover:opacity-70'
                    : localeExistsInSet(lv.locale)
                      ? 'opacity-50 hover:opacity-80'
                      : 'opacity-20 hover:opacity-40'"
                  @click="navigateToLocale(lv.locale)"
                >
                  <template v-if="lv.locale !== lv.lang">
                    <span class="rounded border border-blue-300 bg-blue-100 px-1 font-mono text-xs text-blue-700">{{ lv.locale }}</span>
                  </template>
                  <template v-else>
                    <span class="rounded bg-gray-100 dark:bg-gray-800 px-1 font-mono text-xs text-gray-600 dark:text-gray-400">{{ lv.lang }}</span>
                  </template>
                </div>
              </div>

              <!-- Set/number section -->
              <div class="divide-y">
                <div v-for="group in visibleGroups" :key="group.set" class="py-2 first:pt-0">
                  <div
                    class="mb-1 flex cursor-pointer items-center gap-2 hover:opacity-70"
                    @click="navigateToSet(group.set)"
                  >
                    <img
                      :src="getSetIconUrl(group.set, groupRarity(group))"
                      class="w-4 h-4 shrink-0 object-contain dark:invert"
                      :alt="group.set"
                    >
                    <UTooltip :text="getSetName(group.set)" class="min-w-0 flex-1 truncate">
                      <div class="truncate" :class="group.set === data.set ? 'text-primary' : 'text-gray-500 dark:text-gray-400'">
                        <span class="text-sm font-semibold">{{ getSetName(group.set) }}</span>
                        <span class="ml-1 font-mono text-xs opacity-50">{{ group.set }}</span>
                      </div>
                    </UTooltip>
                    <span
                      class="w-4 shrink-0 text-center font-mono text-sm font-bold"
                      :class="RARITY_COLOR[groupRarity(group)]"
                    >{{ RARITY_LETTER[groupRarity(group)] }}</span>
                  </div>
                  <div class="flex flex-wrap gap-x-2 gap-y-0.5">
                    <div
                      v-for="version in group.versions"
                      :key="`${version.set}-${version.number}`"
                      class="cursor-pointer text-xs hover:opacity-70"
                      :class="[
                        version.number === data.number && version.set === data.set
                          ? 'font-semibold text-primary'
                          : 'text-gray-500 dark:text-gray-400',
                        !numberHasCurrentLang[`${version.set}:${version.number}`] ? 'opacity-40' : '',
                      ]"
                      @click="navigateToNumber(version.set, version.number)"
                    >
                      #{{ version.number }}
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="!showAllSets && groupedVersions.length > SETS_LIMIT">
                <UButton size="sm" variant="ghost" @click="showAllSets = true">
                  Show all ({{ groupedVersions.length }} sets)
                </UButton>
              </div>
            </div>

            <div class="mt-4 space-y-2 border-t pt-4 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Release:</span>
                <span>{{ data.print.releaseDate }}</span>
              </div>
              <div v-if="data.printPart.artist" class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Artist:</span>
                <span>{{ data.printPart.artist }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Number:</span>
                <span>{{ data.number }}</span>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { locale as localeSchema, formats } from '#model/magic/schema/basic';

import { groupBy, omitBy, sortBy, uniq, uniqBy } from 'lodash-es';

const { $orpc } = useNuxtApp();
const route = useRoute('card-id');
const router = useRouter();
const gameLocale = useGameLocale();
const { public: { assetBaseUrl } } = useRuntimeConfig();
const { setActions } = useActions();
const actionMeta = getMagicActionMeta();
const actions = useMagicActions();

definePageMeta({
  layout:    'main',
  titleType: 'input',
  actions:   [actionMeta.random],
});

setActions([actions.random]);

const query = computed(() => {
  const q = {
    cardId:    route.params.id as string,
    locale:    localeSchema.safeParse(route.query.locale as string).data ?? gameLocale.value,
    set:       route.query.set as string,
    number:    route.query.number as string,
    partIndex: route.query.part as string ?? '0',
  };

  return omitBy(q, v => v == null) as Parameters<typeof $orpc.magic.card.fuzzy>[0];
});

const asyncDataKey = () => [
  'magic-card-fuzzy',
  query.value.cardId,
  query.value.locale,
  query.value.set ?? '',
  query.value.number ?? '',
  query.value.partIndex ?? '',
].join(':');

const { data } = await useAsyncData(
  asyncDataKey,
  () => $orpc.magic.card.fuzzy(query.value),
  { watch: [query] },
);

useTitle(() => {
  if (!data.value) return '';
  const unifiedName = data.value.cardPartLocalization.name;
  const oracleName = data.value.cardPart.name;
  return unifiedName === oracleName
    ? unifiedName
    : `${unifiedName} (${oracleName})`;
});

type TextMode = 'oracle' | 'unified' | 'printed';

const textMode = ref<TextMode>('unified');

// ─── Part switching ───────────────────────────────────────────────────────────

const partIndex = computed({
  get: () => parseInt(route.query.part as string ?? '0', 10),
  set: (v: number) => {
    void router.replace({ query: { ...route.query, part: v.toString() } });
  },
});

const layout = computed(() => data.value?.print.layout ?? '');
const partCount = computed(() => data.value?.card.partCount ?? 1);

const partIcon = computed(() => {
  const dfIcons = setProfiles.value?.[data.value?.set ?? '']?.doubleFacedIcon;

  switch (layout.value) {
  case 'flip':
  case 'split':
  case 'aftermath':
  case 'split_arena':
    return {
      src:   `/part-icon/${layout.value}.svg`,
      class: partIndex.value === 1 ? 'rotate-180' : '',
    };
  case 'transform':
  case 'transform_token':
    if (dfIcons != null && dfIcons.length > 0) {
      const icon = dfIcons[partIndex.value]!;
      return { src: `/part-icon/transform-${icon}.svg`, class: '' };
    }
    return { src: `/part-icon/transform-${partIndex.value}.svg`, class: '' };
  case 'modal_dfc':
  case 'adventure':
    return { src: `/part-icon/${layout.value}-${partIndex.value}.svg`, class: '' };
  case 'multipart':
    return { src: '/part-icon/multipart.svg', class: '' };
  default:
    return null;
  }
});

const switchPart = () => {
  if (partIndex.value === partCount.value - 1) {
    partIndex.value = 0;
  } else {
    partIndex.value += 1;
  }
};

const stripArena = (name: string) => name.startsWith('A-') ? name.slice(2) : name;

const isArenaVariant = computed(() => data.value?.cardPart.name.startsWith('A-') ?? false);

const displayPart = computed(() => {
  if (!data.value) return { name: '', typeline: '', text: '' };
  if (textMode.value === 'oracle') {
    return {
      name:     stripArena(data.value.cardPart.name),
      typeline: data.value.cardPart.typeline,
      text:     data.value.cardPart.text,
    };
  }
  if (textMode.value === 'printed') {
    return {
      name:     stripArena(data.value.printPart.name),
      typeline: data.value.printPart.typeline,
      text:     data.value.printPart.text,
    };
  }
  // unified (default)
  return {
    name:     stripArena(data.value.cardPartLocalization.name),
    typeline: data.value.cardPartLocalization.typeline,
    text:     data.value.cardPartLocalization.text,
  };
});

const stats = computed(() => {
  if (!data.value) return null;
  const p = data.value.cardPart;
  if (p.power != null && p.toughness != null) return `${p.power}/${p.toughness}`;
  if (p.loyalty != null) return `[${p.loyalty}]`;
  if (p.defense != null) return `<${p.defense}>`;
  if (p.handModifier != null && p.lifeModifier != null) return `${p.handModifier};${p.lifeModifier}`;
  return null;
});

const ATTRACTION_LIGHT_COLORS: Record<number, string> = {
  2: '#0A86A6',
  3: '#7AC057',
  4: '#B9B36A',
  5: '#A83F81',
  6: '#C77151',
};

const attractionLightStyle = (i: number, lights: string) => {
  const enabled = lights.includes(i.toString());
  return {
    backgroundColor: enabled ? (ATTRACTION_LIGHT_COLORS[i] ?? '#888') : '#494947',
    color:           enabled ? '#fff' : '#888',
  };
};

const tags = computed(() => data.value?.card.tags?.filter(v => !v.startsWith('dev:')) ?? []);
const printTags = computed(() => data.value?.print.printTags?.filter(v => !v.startsWith('dev:')) ?? []);

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

const legalityEntries = computed(() =>
  Object.entries(data.value?.card.legalities ?? {}).sort(
    (a, b) => formats.indexOf(a[0]) - formats.indexOf(b[0]),
  ),
);

const SETS_LIMIT = 10;
const showAllSets = ref(false);

// ─── Rarity display ──────────────────────────────────────────────────────────

const RARITY_LETTER: Record<string, string> = {
  common:   'C',
  uncommon: 'U',
  rare:     'R',
  mythic:   'M',
  bonus:    'B',
  special:  'S',
};

const RARITY_COLOR: Record<string, string> = {
  common:   'text-gray-400',
  uncommon: 'text-slate-400',
  rare:     'text-yellow-500',
  mythic:   'text-orange-500',
  bonus:    'text-purple-500',
  special:  'text-red-500',
};

const groupRarity = (group: (typeof groupedVersions.value)[number]): string => {
  if (group.set === data.value?.set) return data.value.print.rarity;
  return group.versions[0]?.rarity ?? 'common';
};

// ─── Set profiles ─────────────────────────────────────────────────────────────

const uniqueSetIds = computed(() =>
  data.value ? uniq(data.value.versions.map(v => v.set)) : [],
);

const { data: setProfiles } = await useAsyncData(
  () => `magic-set-profiles:${uniqueSetIds.value.join(',')}`,
  async () => {
    const profiles = await Promise.all(
      uniqueSetIds.value.map(setId => $orpc.magic.set.profile(setId)),
    );
    return Object.fromEntries(profiles.map(p => [p.setId, p]));
  },
  { watch: [uniqueSetIds] },
);

const getSetName = (setId: string) => {
  const profile = setProfiles.value?.[setId];
  if (!profile) return setId;
  const loc = profile.localization.find(l => l.lang === gameLocale.value)
    ?? profile.localization.find(l => l.lang === 'en')
    ?? profile.localization[0];
  return loc?.name ?? setId;
};

const AUX_SET_TYPES = ['promo', 'token', 'memorabilia', 'funny', 'masters', 'planechase', 'box', 'archenemy'];

const getSetIconUrl = (setId: string, rarity: string) => {
  const profile = setProfiles.value?.[setId];
  const iconSet = (profile && AUX_SET_TYPES.includes(profile.type) && profile.parent)
    ? profile.parent
    : setId;
  return `${assetBaseUrl}/magic/set/icon/${iconSet}/${rarity}.svg`;
};

// ─────────────────────────────────────────────────────────────────────────────

const uniqueLocales = computed(() => {
  if (!data.value) return [];
  const uniq = uniqBy(
    data.value.versions.map(v => ({ locale: v.locale, lang: v.lang })),
    v => `${v.locale}-${v.lang}`,
  );
  return sortBy(uniq, v => localeSchema.options.indexOf(v.locale));
});

const numberPrefix = (n: string) => parseInt(n.match(/^\d+/)?.[0] ?? '0', 10);

const numberHasCurrentLang = computed(() => {
  if (!data.value) return {} as Record<string, boolean>;
  const lang = data.value.lang;
  const result: Record<string, boolean> = {};
  for (const v of data.value.versions) {
    const key = `${v.set}:${v.number}`;
    if (v.lang === lang) result[key] = true;
    else if (!(key in result)) result[key] = false;
  }
  return result;
});

const localeExistsInSet = (locale: string) => {
  if (!data.value) return false;
  return data.value.versions.some(v => v.set === data.value!.set && v.locale === locale);
};

const groupedVersions = computed(() => {
  if (!data.value) return [];
  const setsInOrder = uniqBy(data.value.versions, 'set').map(v => v.set);
  const grouped = groupBy(data.value.versions, 'set');
  return setsInOrder.map(set => ({
    set,
    versions: sortBy(uniqBy(grouped[set]!, 'number'), [v => numberPrefix(v.number), 'number']),
  }));
});

const visibleGroups = computed(() => {
  return showAllSets.value ? groupedVersions.value : groupedVersions.value.slice(0, SETS_LIMIT);
});

const navigateToLocale = (targetLocale: string) => {
  const versions = data.value?.versions ?? [];
  const currentSet = query.value.set;

  const candidate
    = versions.find(v => v.locale === targetLocale && v.set === currentSet)
      ?? versions.find(v => v.locale === targetLocale);

  router.replace({
    query: {
      ...route.query,
      locale: targetLocale,
      set:    candidate?.set ?? currentSet,
      number: undefined,
    },
  });
};

const navigateToSet = (targetSet: string) => {
  const versions = data.value?.versions ?? [];
  const currentLocale = query.value.locale;

  const candidate
    = versions.find(v => v.set === targetSet && v.locale === currentLocale)
      ?? versions.find(v => v.set === targetSet);

  router.replace({
    query: {
      ...route.query,
      set:    targetSet,
      locale: candidate?.locale ?? currentLocale,
      number: undefined,
    },
  });
};

const navigateToNumber = (targetSet: string, targetNumber: string) => {
  const versions = data.value?.versions ?? [];
  const currentLocale = query.value.locale;

  const candidate
    = versions.find(v => v.set === targetSet && v.number === targetNumber && v.locale === currentLocale)
      ?? versions.find(v => v.set === targetSet && v.number === targetNumber);

  router.replace({
    query: {
      ...route.query,
      set:    targetSet,
      number: targetNumber,
      locale: candidate?.locale ?? currentLocale,
    },
  });
};

const imageLang = computed(() => {
  if (!data.value) return 'en';
  if (data.value.print.imageStatus !== 'placeholder') return data.value.lang;

  const sameSetNumber = data.value.versions.filter(
    v => v.set === data.value!.set && v.number === data.value!.number,
  );

  const fallback = localeSchema.options
    .map(loc => sameSetNumber.find(v => v.lang === loc))
    .find(v => v != null);

  return fallback?.lang ?? 'en';
});

// ─── Special effects ─────────────────────────────────────────────────────────

/** Lift rotate state to parent so it can be controlled externally during navigation */
const rotate = ref<boolean | null>(null);

const specialEffect = computed<'capital_offense' | 'viscera_seer' | null>(() => {
  const id = data.value?.cardId;
  if (id === 'capital_offense') return 'capital_offense';
  if (id === 'viscera_seer' && data.value?.set === 'sld' && data.value?.number === 'VS') return 'viscera_seer';
  return null;
});

// capital_offense: inject a global style that lowercases the entire page,
// including inside buttons (via !important), but excludes mana/set symbols.
// The style tag is automatically removed when navigating away from this page.
useHead(computed(() => ({
  style: specialEffect.value === 'capital_offense'
    ? [{
      id:        'capital-offense-style',
      innerHTML: '* { text-transform: lowercase !important; } .magic-symbol { text-transform: none !important; }',
    }]
    : [],
})));

/** viscera_seer: horizontally flip the card text sections (above legalities) */
const effectStyle = computed(() =>
  specialEffect.value === 'viscera_seer' ? { transform: 'rotateY(180deg)' } : {},
);

// ─── External links ───────────────────────────────────────────────────────────

const scryfallLink = computed(() => {
  const cardId = data.value?.print.scryfallCardId;
  if (cardId == null) return null;
  return `https://scryfall.com/card/${cardId}`;
});

const gathererLink = computed(() => {
  const multiverseIds = data.value?.print.multiverseId;
  if (!multiverseIds || multiverseIds.length === 0) return null;

  const isMultipart = ['split', 'adventure'].includes(data.value?.print.layout ?? '');
  const id = isMultipart ? multiverseIds[0] : multiverseIds[partIndex.value];

  if (id == null) return null;
  return `https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${id}&printed=true`;
});

const mtgchLink = computed(() => {
  if (!data.value) return '';
  return `https://mtgch.com/card/${data.value.set}/${data.value.number}`;
});

const jsonCardLink = computed(() => {
  if (!data.value) return undefined;
  const params = new URLSearchParams({
    cardId:    data.value.cardId,
    locale:    data.value.locale,
    partIndex: partIndex.value.toString(),
  });
  return `/rpc/magic/card?${params.toString()}`;
});

const jsonPrintLink = computed(() => {
  if (!data.value) return undefined;
  const params = new URLSearchParams({
    cardId:    data.value.cardId,
    set:       data.value.set,
    number:    data.value.number,
    lang:      data.value.lang,
    partIndex: partIndex.value.toString(),
  });
  return `/rpc/magic/print?${params.toString()}`;
});
</script>
