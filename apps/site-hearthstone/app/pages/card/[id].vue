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
              :render-hash="data.renderHash"
              :variant="variant"
              :has-premium-mechanic="hasPremium"
              loading="eager"
            />

            <div class="mt-4">
              <USelect
                v-model="variant"
                :items="variantOptions"
                size="sm"
                class="w-full"
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
              {{ cardTypeLabel(data.type) }}
              <template v-if="data.race && data.race.length > 0">
                ·
                <span v-for="(r, i) in data.race" :key="r">
                  {{ raceLabel(r) }}<span v-if="i < data.race.length - 1">/</span>
                </span>
              </template>
              <template v-if="data.spellSchool">
                / {{ spellSchoolLabel(data.spellSchool) }}
              </template>
            </span>
            <span v-if="stats" class="font-medium shrink-0">{{ stats }}</span>
          </div>

          <!-- Card text -->
          <div v-if="data.localization.displayText" class="border-l-2 border-primary bg-gray-50 dark:bg-gray-800 rounded-r-lg p-4 mb-6 leading-relaxed">
            <RichText :key="`${data.cardId}:${gameLocale}:${data.localization.displayText}`" :flatten-line-breaks="true">{{ data.localization.displayText }}</RichText>
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
                :key="`${group.relation}:${gameLocale}`"
                class="border rounded-lg overflow-hidden"
              >
                <div class="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 text-sm font-medium">
                  <UIcon :name="relationIcon(group.relation)" class="shrink-0 text-gray-400" />
                  <span>{{ relationText(group.relation) }}</span>
                </div>
                <div class="grid gap-2 p-3 sm:grid-cols-2">
                  <NuxtLink
                    v-for="rel in group.cards"
                    :key="`${rel.relation}:${rel.cardId}:${gameLocale}`"
                    :to="relatedLink(rel)"
                    class="block min-w-0 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 hover:opacity-80"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-medium text-primary truncate">
                        {{ rel.name ?? rel.cardId }}
                      </span>
                      <UBadge v-if="rel.type" color="neutral" variant="subtle" size="sm">
                        {{ cardTypeLabel(rel.type) }}
                      </UBadge>
                    </div>
                    <RichText
                      v-if="rel.displayText"
                      :key="`${rel.cardId}:${gameLocale}:${rel.displayText}`"
                      :flatten-line-breaks="true"
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
      <p>{{ $t('hearthstone.card.not-found') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { last } from 'lodash-es';

import type { Locale } from '#model/hearthstone/schema/basic';
import type { CardProfile } from '#model/hearthstone/schema/card';
import type { Patch } from '#model/hearthstone/schema/patch';
import {
  HAS_DIAMOND,
  HAS_SIGNATURE,
  PREMIUM,
} from '#model/hearthstone/constant/tag';
import type { CardImageOption } from '~/utils/card-image';

import { getHearthstoneLabel } from '~/utils/hearthstone-labels';

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

const gameLocale = useGameLocale();
const lang = computed<Locale>(() => gameLocale.value as Locale);

const profile = ref<CardProfile | null>(null);

watchEffect(async () => {
  try {
    profile.value = await $orpc.hearthstone.card.profile(route.params.id as string);
  } catch {
    profile.value = null;
  }
});

// Data fetching

const query = computed(() => ({
  cardId:  route.params.id as string,
  lang:    lang.value,
  version: route.query.version != null
    ? Number.parseInt(route.query.version as string, 10)
    : undefined,
}));

const asyncDataKey = computed(() => [
  'hearthstone-card',
  query.value.cardId,
  query.value.lang,
  query.value.version ?? '',
].join(':'));

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

const mechanicEntries = computed(() =>
  Object.entries(data.value?.mechanics ?? {}),
);

const mechanics = computed(() =>
  mechanicEntries.value
    .filter(([key]) => !key.startsWith('?'))
    .map(([key, value]) => value === true ? key : `${key}:${value}`),
);

const referencedTags = computed(() =>
  Object.entries(data.value?.referencedTags ?? {})
    .filter(([key]) => !key.startsWith('?'))
    .map(([key, value]) => value === true ? key : `${key}:${value}`),
);

const hasMechanic = (enumId: string) =>
  mechanicEntries.value.some(([name, value]) =>
    name === enumId && (value === true || (typeof value === 'number' && value !== 0)),
  );

const mechanicText = (m: string) => {
  const slugMap = data.value?.mechanicTags ?? {};
  const resolveKey = (key: string) => slugMap[key] ?? key;

  if (m.includes(':')) {
    const sep = m.indexOf(':');
    const mid = resolveKey(m.slice(0, sep));
    const arg = m.slice(sep + 1);
    const key = `hearthstone.tag.${mid}`;
    return `${te(key) ? t(key) : mid}:${arg}`;
  }
  const slug = resolveKey(m);
  const key = `hearthstone.tag.${slug}`;
  return te(key) ? t(key) : slug;
};

const toast = useToast();

const copyTag = async (tag: string) => {
  const tagName = /^[^:]+(:|$)/.exec(tag)![0]!;
  try {
    await navigator.clipboard.writeText(tagName);
    toast.add({ title: t('hearthstone.card.tag-copied'), color: 'success' });
  } catch {
    // clipboard not available
  }
};

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
    SET_1957: 'Across the Timeways',
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
    SET_1957: '穿越时间流',
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
    SET_1957: '時光特攻隊',
    SET_1980: '浩劫與重生',
  },
};

// Related cards

const relationOrder = [
  'hero_power',
  'heroic_hero_power',
  'colossal_token',
  'cataclysm',
  'titan_ability',
  'plague_token',
  'fabled_related',
  'herald_token',
  'herald_upgrade',
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
  if (relation === 'colossal_token') {
    return lang.value === 'zht' ? '巨型衍生物' : lang.value === 'zhs' ? '巨型衍生物' : 'Colossal tokens';
  }

  if (relation === 'herald_upgrade') {
    return lang.value === 'zht' ? '預兆升級' : lang.value === 'zhs' ? '兆示升级' : 'Herald upgrades';
  }

  const label = getHearthstoneLabel('relation', relation, lang.value);
  if (label !== relation) return label;

  const key = `hearthstone.card.relation.${relation}`;
  return te(key) ? t(key) : relation;
};

const cardTypeLabel = (value: string) => getHearthstoneLabel('type', value, lang.value);
const raceLabel = (value: string) => getHearthstoneLabel('race', value, lang.value);
const spellSchoolLabel = (value: string) => getHearthstoneLabel('spellSchool', value, lang.value);

const relatedLink = (rel: NonNullable<typeof data.value>['relatedCards'][number]) => ({
  path:  `/card/${rel.cardId}`,
  query: rel.version[0] != null ? { version: rel.version[0] } : undefined,
});

// Variant

const hasPremium = computed(() =>
  hasMechanic(String(PREMIUM)),
);

const isBattlegrounds = computed(() => {
  const d = data.value;
  return d != null && (d.set === 'bgs' || (d.techLevel != null && !d.collectible));
});

const hasBattlegroundsVariant = computed(() => {
  const d = data.value;
  return d != null && (d.set === 'bgs' || d.techLevel != null);
});

const variant = ref<CardImageOption>(isBattlegrounds.value ? 'battlegrounds' : 'normal');

const variantOptions = computed(() => {
  const opts: Array<{ label: string, value: CardImageOption }> = [
    { label: t('hearthstone.card.variant.normal'), value: 'normal' },
    { label: t('hearthstone.card.variant.golden'), value: 'golden' },
  ];

  if (hasMechanic(String(HAS_DIAMOND))) {
    opts.push({ label: t('hearthstone.card.variant.diamond'), value: 'diamond' });
  }
  if (hasMechanic(String(HAS_SIGNATURE))) {
    opts.push({ label: t('hearthstone.card.variant.signature'), value: 'signature' });
  }
  if (hasBattlegroundsVariant.value) {
    opts.push({ label: t('hearthstone.card.variant.battlegrounds'), value: 'battlegrounds' });
  }

  return opts;
});

watch(isBattlegrounds, v => {
  if (v) variant.value = 'battlegrounds';
}, { immediate: true });

watch(hasBattlegroundsVariant, v => {
  if (!v) variant.value = 'normal';
});

// Relation icon

const relationIcon = (relation: string): string => ({
  collection_related: 'lucide:refresh-cw',
  colossal_token:     'lucide:boxes',
  cataclysm:          'lucide:flame',
  emblem:             'lucide:shield',
  intext:             'lucide:search',
  meld:               'lucide:git-merge',
  specialization:     'lucide:git-fork',
  spellbook:          'lucide:book',
  source:             'lucide:list-tree',
  stick_on:           'lucide:layers',
  token:              'lucide:square',
  entourage:          'lucide:boxes',
  fabled_related:     'lucide:sparkles',
  herald_token:       'lucide:sparkles',
  herald_upgrade:     'lucide:chevrons-up',
  hero_power:         'lucide:zap',
  heroic_hero_power:  'lucide:zap',
  plague_token:       'lucide:biohazard',
  titan_ability:      'lucide:badge-bolt',
} as Record<string, string>)[relation] ?? 'lucide:copy';
</script>
