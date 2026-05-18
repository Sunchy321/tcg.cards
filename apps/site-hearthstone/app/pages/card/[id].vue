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
              :lang="lang"
              :variant="variant"
            />

            <div class="mt-4 flex gap-2">
              <USelect
                v-model="variant"
                :items="variantOptions"
                size="sm"
                class="flex-1"
              />
              <USelect
                v-model="lang"
                :items="languageSelectItems"
                size="sm"
                class="flex-1"
              />
            </div>

            <div v-if="data.artist" class="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {{ data.artist }}
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
            <ManaCost v-if="data.cost != null" :value="data.cost" />
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

          <!-- Set -->
          <div v-if="setText" class="flex flex-wrap gap-2 mb-6">
            <UBadge color="primary" variant="subtle" size="lg">
              {{ setText }}
            </UBadge>
          </div>

          <!-- Related cards -->
          <div v-if="relatedGroups.length > 0" class="mb-6">
            <h2 class="text-xl font-semibold mb-4">{{ $t('hearthstone.card.related') }}</h2>

            <div class="space-y-4">
              <div
                v-for="group in relatedGroups"
                :key="group.relation"
                class="border rounded-lg overflow-hidden"
              >
                <div class="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 text-sm font-medium">
                  <UIcon :name="relationIcon(group.relation)" class="shrink-0 text-gray-400" />
                  <span>{{ relationText(group.relation) }}</span>
                </div>
                <div class="grid gap-2 p-3 sm:grid-cols-2">
                  <NuxtLink
                    v-for="rel in group.cards"
                    :key="`${rel.relation}:${rel.cardId}`"
                    :to="relatedLink(rel)"
                    class="block min-w-0 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 hover:opacity-80"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-medium text-primary truncate">
                        {{ rel.name ?? rel.cardId }}
                      </span>
                      <UBadge v-if="rel.type" color="neutral" variant="subtle" size="sm">
                        {{ $t(`hearthstone.card.type.${rel.type}`) }}
                      </UBadge>
                    </div>
                    <RichText
                      v-if="rel.displayText"
                      class="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300"
                    >
                      {{ rel.displayText }}
                    </RichText>
                  </NuxtLink>
                </div>
              </div>
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

            <div v-if="versionInfos.length > 0" class="divide-y">
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

import { locale as localeSchema } from '#model/hearthstone/schema/basic';
import type { Locale } from '#model/hearthstone/schema/basic';
import type { CardProfile } from '#model/hearthstone/schema/card';
import type { Patch } from '#model/hearthstone/schema/patch';

const { $orpc } = useNuxtApp();
const route = useRoute('card-id');
const router = useRouter();
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

// Language

const lang = computed<Locale>({
  get: () => localeSchema.safeParse(route.query.lang as string).data
    ?? 'zhs',
  set: (v: string) => { void router.replace({ query: { ...route.query, lang: v } }); },
});

const profile = ref<CardProfile | null>(null);

watchEffect(async () => {
  try {
    profile.value = await $orpc.hearthstone.card.profile(route.params.id as string);
  } catch {
    profile.value = null;
  }
});

const localeOrder = localeSchema.options;

const nativeLanguageNames: Record<Locale, string> = {
  en:  'English',
  de:  'Deutsch',
  es:  'Español',
  fr:  'Français',
  it:  'Italiano',
  ja:  '日本語',
  ko:  '한국어',
  mx:  'Español (México)',
  pl:  'Polski',
  pt:  'Português',
  ru:  'Русский',
  th:  'ไทย',
  zhs: '简体中文',
  zht: '繁體中文',
};

const languageOptions = computed(() => {
  const byLang = new Map<Locale, CardProfile['localization'][number]>();

  for (const localization of profile.value?.localization ?? []) {
    byLang.set(localization.lang, localization);
  }

  return [...byLang.values()].sort((a, b) =>
    localeOrder.indexOf(a.lang) - localeOrder.indexOf(b.lang),
  );
});

const languageSelectItems = computed(() =>
  languageOptions.value.map(option => ({
    label: nativeLanguageNames[option.lang],
    value: option.lang,
  })),
);

// Data fetching

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

// Version

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

// Patch profiles

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
        // Patch info can be unavailable for older imported builds.
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

// Stats

const stats = computed(() => {
  const c = data.value;
  if (c == null) return null;
  if (c.attack != null && c.health != null) return `${c.attack}/${c.health}`;
  if (c.attack != null && c.durability != null) return `${c.attack}/${c.durability}`;
  if (c.armor != null) return `[${c.armor}]`;
  if (c.colddown != null) return `#${c.colddown}`;
  return null;
});

// Mechanics and tags

const mechanics = computed(() =>
  (data.value?.mechanics ?? []).filter(v => !v.startsWith('?')),
);

// Legalities

const legalityEntries = computed(() =>
  Object.entries(data.value?.legalities ?? {}),
);

const legalityColor = (status: string) => ({
  legal:      'text-green-500',
  banned:     'text-red-500',
  restricted: 'text-yellow-500',
}[status] ?? 'text-gray-500');

// Set

const setText = computed(() => {
  const set = data.value?.set;
  if (!set) return null;

  const setLocale = lang.value === 'zhs' || lang.value === 'zht' ? lang.value : 'en';
  const key = `hearthstone.set.${set}`;
  return nativeSetNames[setLocale][set] ?? (te(key) ? t(key) : set);
});

const nativeSetNames: Record<'en' | 'zhs' | 'zht', Record<string, string>> = {
  en: {
    CORE:     'Core',
    SET_1691: 'Murder at Castle Nathria',
    SET_1809: 'Festival of Legends',
    SET_1858: 'TITANS',
    SET_1892: 'Showdown in the Badlands',
    SET_1897: 'Whizbang\'s Workshop',
    SET_1905: 'Perils in Paradise',
    SET_1935: 'The Great Dark Beyond',
    SET_1946: 'Into the Emerald Dream',
    SET_1952: 'The Lost City of Un\'Goro',
    SET_1980: 'CATACLYSM',
  },
  zhs: {
    CORE:     '核心',
    SET_1691: '纳斯利亚堡的悬案',
    SET_1809: '传奇音乐节',
    SET_1858: '泰坦诸神',
    SET_1892: '决战荒芜之地',
    SET_1897: '威兹班的工坊',
    SET_1905: '胜地历险记',
    SET_1935: '深暗领域',
    SET_1946: '翡翠梦境',
    SET_1952: '安戈洛龟途',
    SET_1980: '大地的裂变',
  },
  zht: {
    CORE:     '核心',
    SET_1691: '納斯利亞堡懸案',
    SET_1809: '傳奇音樂祭',
    SET_1858: '泰坦',
    SET_1892: '決戰荒蕪之地',
    SET_1897: '威茲邦的工作坊',
    SET_1905: '天堂島危機',
    SET_1935: '無垠黑暗之境',
    SET_1946: '深入翡翠夢境',
    SET_1952: '安戈洛失落之城',
    SET_1980: '浩劫與重生',
  },
};

// Related cards

const relationOrder = [
  'hero_power',
  'heroic_hero_power',
  'titan_ability',
  'plague_token',
  'herald_token',
  'entourage',
  'collection_related',
  'token',
  'source',
];

const relatedGroups = computed(() => {
  const groups = new Map<string, NonNullable<typeof data.value>['relatedCards']>();

  for (const rel of data.value?.relatedCards ?? []) {
    const cards = groups.get(rel.relation) ?? [];
    cards.push(rel);
    groups.set(rel.relation, cards);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      const ai = relationOrder.indexOf(a);
      const bi = relationOrder.indexOf(b);
      return (ai === -1 ? relationOrder.length : ai) - (bi === -1 ? relationOrder.length : bi);
    })
    .map(([relation, cards]) => ({ relation, cards }));
});

const relationText = (relation: string): string => {
  const key = `hearthstone.card.relation.${relation}`;
  return te(key) ? t(key) : relation;
};

const relatedLink = (rel: NonNullable<typeof data.value>['relatedCards'][number]) => ({
  path:  `/card/${rel.cardId}`,
  query: {
    lang: lang.value,
    ...(rel.version[0] != null ? { version: rel.version[0] } : {}),
  },
});

// Variant

const variant = ref('normal');

const hasTechLevel = computed(() => data.value?.techLevel != null);

const variantOptions = computed(() => {
  const opts = [
    { label: t('hearthstone.card.variant.normal'), value: 'normal' },
    { label: t('hearthstone.card.variant.golden'), value: 'golden' },
  ];

  if (mechanics.value.includes('has_diamond')) {
    opts.push({ label: t('hearthstone.card.variant.diamond'), value: 'diamond' });
  }
  if (mechanics.value.includes('has_signature')) {
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

// Relation icon

const relationIcon = (relation: string): string => ({
  collection_related: 'lucide:refresh-cw',
  emblem:         'lucide:shield',
  intext:         'lucide:search',
  meld:           'lucide:git-merge',
  specialization: 'lucide:git-fork',
  spellbook:      'lucide:book',
  source:         'lucide:list-tree',
  stick_on:       'lucide:layers',
  token:          'lucide:square',
  entourage:      'lucide:boxes',
  herald_token:   'lucide:sparkles',
  hero_power:     'lucide:zap',
  heroic_hero_power: 'lucide:zap',
  plague_token:   'lucide:biohazard',
  titan_ability:  'lucide:badge-bolt',
} as Record<string, string>)[relation] ?? 'lucide:copy';
</script>
