<template>
  <div class="container mx-auto px-4 py-6">
    <div v-if="data" class="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      <!-- Left column: Card image and language -->
      <div class="lg:col-span-3">
        <div class="sticky top-24">
          <div class="hs-surface-card rounded-2xl p-4">
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
                v-model="lang"
                :items="languageSelectItems"
                size="sm"
                class="w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Middle column: Card details -->
      <div class="lg:col-span-6">
        <div class="hs-surface-card rounded-2xl p-5">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h1 class="text-3xl font-bold">{{ data.localization.name }}</h1>
            <ManaCost v-if="data.cost != null" :value="data.cost" />
          </div>

          <div class="hs-surface-muted my-4 flex items-center gap-2 rounded-lg border px-3 py-2">
            <span class="flex-1 font-medium">
              {{ cardTypeLabel(data.type) }}
              <template v-if="raceText">
                / {{ raceText }}
              </template>
              <template v-if="data.spellSchool">
                / {{ spellSchoolLabel(data.spellSchool) }}
              </template>
            </span>
            <ArmorValue v-if="data.armor != null" :value="data.armor" :size="32" />
            <span v-else-if="stats" class="shrink-0 font-medium">{{ stats }}</span>
          </div>

          <div
            v-if="data.localization.displayText"
            class="hs-surface-panel mb-6 rounded-r-lg border-l-2 border-primary p-4 leading-relaxed"
          >
            <RichText
              :key="`${data.cardId}:${lang}:${data.localization.displayText}`"
              :flatten-line-breaks="true"
            >
              {{ data.localization.displayText }}
            </RichText>
          </div>

          <div
            v-if="data.localization.flavorText"
            class="hs-surface-panel hs-subtle-text mb-6 rounded-r-lg border-l-2 border-primary p-4 italic"
          >
            {{ data.localization.flavorText }}
          </div>

          <div v-if="relatedGroups.length > 0" class="mb-6">
            <h2 class="mb-4 text-xl font-semibold">{{ $t('hearthstone.card.related') }}</h2>

            <div class="space-y-4">
              <div
                v-for="group in relatedGroups"
                :key="`${group.relation}:${lang}`"
                class="overflow-hidden rounded-lg border"
              >
                <div class="hs-surface-muted flex items-center gap-2 border-b px-3 py-2 text-sm font-medium">
                  <UIcon :name="relationIcon(group.relation)" class="shrink-0 hs-subtle-text" />
                  <span>{{ relationText(group.relation) }}</span>
                </div>
                <div class="grid gap-2 p-3 sm:grid-cols-2">
                  <NuxtLink
                    v-for="rel in group.cards"
                    :key="`${rel.relation}:${rel.cardId}:${lang}`"
                    :to="relatedLink(rel)"
                    :prefetch="false"
                    class="block min-w-0 rounded-md border px-3 py-2 transition-opacity hover:opacity-80"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate font-medium text-hearthstone-700 dark:text-hearthstone-300">
                        {{ rel.name ?? rel.cardId }}
                      </span>
                      <UBadge v-if="rel.type" color="neutral" variant="subtle" size="sm">
                        {{ cardTypeLabel(rel.type) }}
                      </UBadge>
                    </div>
                    <RichText
                      v-if="rel.displayText"
                      :key="`${rel.cardId}:${lang}:${rel.displayText}`"
                      :flatten-line-breaks="true"
                      class="mt-2 text-sm leading-6 hs-subtle-text"
                    >
                      {{ rel.displayText }}
                    </RichText>
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>

          <div v-if="data.artist" class="flex justify-start">
            <div class="hs-chip hs-artist-link">
              <UIcon name="lucide:paintbrush" class="shrink-0" />
              <span>{{ data.artist }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right column: Set, format legality, and versions -->
      <div class="space-y-6 lg:col-span-3">
        <div class="sticky top-24 space-y-6">
          <div v-if="setText" class="hs-surface-card side-info-card rounded-2xl p-5">
            <div v-if="setText" class="side-info-section">
              <div class="side-label">{{ $t('hearthstone.set.$self') }}</div>
              <div class="hs-set-display">
                <span v-if="setIconUrl" class="hs-set-icon-tile">
                  <img
                    :src="setIconUrl"
                    alt=""
                    class="hs-set-icon-image"
                    :class="setIconTone === 'mono' ? 'hs-set-icon-image--mono' : 'hs-set-icon-image--color'"
                  >
                </span>
                <span class="hs-set-name">
                  {{ setText }}
                </span>
              </div>
            </div>

            <div class="side-info-section">
              <div class="side-label">{{ $t('hearthstone.search.command.format') }}</div>
              <div class="space-y-2">
                <div
                  v-for="entry in formatLegalityEntries"
                  :key="entry.format"
                  class="hs-legality-row"
                  :class="legalityRowClass(entry.status)"
                >
                  <span>{{ formatText(entry.format) }}</span>
                  <span>{{ legalityDisplayText(entry) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="versionInfos.length > 1" class="hs-surface-card rounded-2xl p-5">
            <div class="hs-version-list">
              <div
                v-for="v in versionInfos"
                :key="v.versions[0]"
                class="flex cursor-pointer items-center gap-2 py-2 first:pt-0 hover:opacity-70"
                @click="version = v.versions[0]!"
              >
                <div
                  class="hs-version-dot h-2.5 w-2.5 shrink-0 rounded-full border"
                  :class="v.versions.includes(version) ? 'bg-hearthstone-500 border-hearthstone-500' : ''"
                />
                <div>
                  <div :class="v.versions.includes(version) ? 'font-semibold text-hearthstone-700 dark:text-hearthstone-300' : ''">
                    {{ v.firstName }}
                  </div>
                  <div v-if="v.versions.length > 1 && v.lastName !== v.firstName" class="text-xs hs-subtle-text">
                    ~ {{ v.lastName }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="status === 'pending'" class="flex justify-center py-24">
      <UIcon name="lucide:loader" class="animate-spin text-4xl hs-subtle-text" />
    </div>

    <div v-else class="flex flex-col items-center gap-4 py-24 hs-subtle-text">
      <UIcon name="lucide:frown" class="text-5xl" />
      <p>{{ $t('hearthstone.card.not-found') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { locale as localeSchema, type Locale } from '#model/hearthstone/schema/basic';
import type { CardProfile } from '#model/hearthstone/schema/card';
import type { CardFullView } from '#model/hearthstone/schema/entity';
import type { Patch } from '#model/hearthstone/schema/patch';
import type { CardImageOption } from '~/utils/card-image';

import { getHearthstoneLabel } from '~/utils/hearthstone-labels';
import { hearthstoneSetIconTone, hearthstoneSetIconUrl } from '~/utils/hearthstone-set-icons';

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
  get: () => localeSchema.safeParse(route.query.lang as string).data ?? 'zhs',
  set: (v: string) => { void router.replace({ query: { ...route.query, lang: v } }); },
});

const profile = ref<CardProfile | null>(null);
let profileRequest = 0;

// Loads language options for the current card without racing stale route transitions.
watch(() => route.params.id, async (cardId: string | string[]) => {
  const requestId = ++profileRequest;

  try {
    const result = await $orpc.hearthstone.card.profile(cardId as string);
    if (requestId === profileRequest) {
      profile.value = result;
    }
  } catch {
    if (requestId === profileRequest) {
      profile.value = null;
    }
  }
}, { immediate: true });

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

const languageOptions = computed<CardProfile['localization']>(() => {
  const byLang = new Map<Locale, CardProfile['localization'][number]>();

  for (const localization of profile.value?.localization ?? []) {
    byLang.set(localization.lang, localization);
  }

  return [...byLang.values()].sort((a, b) =>
    localeOrder.indexOf(a.lang) - localeOrder.indexOf(b.lang),
  );
});

const languageSelectItems = computed(() =>
  languageOptions.value.map((option: CardProfile['localization'][number]) => ({
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

const asyncDataKey = computed(() => [
  'hearthstone-card',
  query.value.cardId,
  query.value.lang,
  query.value.version ?? '',
].join(':'));

const { data, status } = await useAsyncData(
  asyncDataKey,
  () => $orpc.hearthstone.card.full(query.value),
  { watch: [query], lazy: true },
);

useTitle(() => data.value?.localization.name ?? '');

// Version

const versions = computed<number[][]>(() => data.value?.versions ?? []);

const version = computed({
  get() {
    const queryVersion = Number.parseInt(route.query.version as string, 10);

    if (!Number.isNaN(queryVersion)) {
      if (data.value == null || versions.value.some((v: number[]) => v.includes(queryVersion))) {
        return queryVersion;
      }
    }

    if (data.value != null) {
      const lastVersion = Math.max(...data.value.version);
      const lastGroup = versions.value.find((v: number[]) => v.includes(lastVersion)) ?? [];
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
let patchRequest = 0;

// Resolves patch names after navigation so version history does not block page transitions.
async function loadPatchProfiles(values: number[][]) {
  const requestId = ++patchRequest;
  const nextProfiles: Record<number, Patch> = {};
  const numbers = [...new Set(values.flatMap((group: number[]) => [group[0]!, group[group.length - 1]!]))];

  for (const buildNumber of numbers) {
    try {
      const patch = await $orpc.hearthstone.patch.full({ buildNumber });
      if (patch) {
        nextProfiles[buildNumber] = patch;
      }
    } catch {
      // Patch info can be unavailable for older imported builds.
    }
  }

  if (requestId === patchRequest) {
    patchProfiles.value = nextProfiles;
  }
}

watch(versions, (values: number[][]) => {
  patchProfiles.value = {};

  if (values.length === 0) {
    return;
  }

  if (import.meta.client && 'requestIdleCallback' in globalThis) {
    requestIdleCallback(() => {
      void loadPatchProfiles(values);
    });
    return;
  }

  void loadPatchProfiles(values);
}, { immediate: true });

const versionInfos = computed(() => versions.value.map((v: number[]) => {
  const first = v[0]!;
  const lastV = v[v.length - 1]!;

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
  if (c.colddown != null) return `#${c.colddown}`;
  return null;
});

// Mechanics and tags

type MechanicEntry = [string, boolean | number];
type RelatedCard = CardFullView['relatedCards'][number];
type RelatedGroup = {
  relation: string;
  cards:    RelatedCard[];
};

const mechanicEntries = computed<MechanicEntry[]>(() =>
  Object.entries(data.value?.mechanics ?? {}),
);

const hasMechanic = (key: string) =>
  mechanicEntries.value.some(([name, value]: MechanicEntry) => name === key && (value === true || (typeof value === 'number' && value !== 0)));

const primaryFormats = ['standard', 'wild', 'classic'];

type FormatEntry = {
  format: string;
  status: string;
  source: 'native' | 'core' | null;
};

const formatLegalityEntries = computed<FormatEntry[]>(() => {
  const legalities = data.value?.legalities ?? {};
  const collectible = data.value?.collectible === true && data.value?.inBobsTavern !== true;

  return primaryFormats.map((format: string) => {
    const native = legalities[format];

    if (format === 'standard') {
      if (collectible && data.value?.standardSetAvailable === true) {
        return { format, status: 'legal', source: 'native' };
      }

      if (native !== 'legal' && data.value?.standardCoreAvailable === true) {
        return { format, status: 'legal', source: 'core' };
      }
    }

    if (native != null) {
      return { format, status: native, source: 'native' };
    }

    if (format === 'wild' && collectible) {
      return { format, status: 'legal', source: null };
    }

    return { format, status: 'unavailable', source: null };
  });
});

const legalityDisplayText = (entry: FormatEntry) => {
  if (entry.status !== 'legal') {
    return t('hearthstone.legality.unavailable');
  }

  return entry.source === 'core'
    ? `${t('hearthstone.card.playable')}(${coreSeriesText()})`
    : t('hearthstone.card.playable');
};

const coreSeriesText = () => lang.value === 'en' ? 'Core Set' : '核心系列';

const legalityRowClass = (status: string) =>
  status === 'legal' ? 'hs-legality-row--available' : 'hs-legality-row--unavailable';

const formatText = (value: string) =>
  te(`hearthstone.format.${value}`) ? t(`hearthstone.format.${value}`) : value;

// Set

const setText = computed(() => {
  const set = data.value?.set;
  if (!set) return null;

  const setLocale: 'en' | 'zhs' | 'zht' = lang.value === 'zhs' || lang.value === 'zht' ? lang.value : 'en';
  const key = `hearthstone.set.${set}`;
  return nativeSetNames[setLocale][set] ?? (te(key) ? t(key) : set);
});

const setIconUrl = computed(() => {
  const set = data.value?.set;
  return set ? hearthstoneSetIconUrl(set) : null;
});

const setIconTone = computed(() => {
  const set = data.value?.set;
  return set ? hearthstoneSetIconTone(set) : 'mono';
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

// Ranks relation groups so duplicate related cards keep the most useful label.
const relationRank = (relation: string) => {
  const index = relationOrder.indexOf(relation);
  return index === -1 ? relationOrder.length : index;
};

const relatedGroups = computed<RelatedGroup[]>(() => {
  const groups = new Map<string, RelatedCard[]>();
  const seen = new Set<string>();
  const orderedCards = [...(data.value?.relatedCards ?? [])]
    .sort((a: RelatedCard, b: RelatedCard) => relationRank(a.relation) - relationRank(b.relation));

  for (const rel of orderedCards) {
    if (seen.has(rel.cardId)) continue;
    seen.add(rel.cardId);

    const cards = groups.get(rel.relation) ?? [];
    cards.push(rel);
    groups.set(rel.relation, cards);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => relationRank(a) - relationRank(b))
    .map(([relation, cards]: [string, RelatedCard[]]) => ({ relation, cards }));
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
const raceText = computed(() => data.value?.race?.map(raceLabel).join('/') ?? '');

const relatedLink = (rel: RelatedCard) => ({
  path:  `/card/${rel.cardId}`,
  query: {
    lang: lang.value,
    ...(rel.version[0] != null ? { version: rel.version[0] } : {}),
  },
});

// Variant

const hasPremium = computed(() =>
  hasMechanic('12') || hasMechanic('premium'),
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

  if (hasMechanic('has_diamond')) {
    opts.push({ label: t('hearthstone.card.variant.diamond'), value: 'diamond' });
  }
  if (hasMechanic('has_signature')) {
    opts.push({ label: t('hearthstone.card.variant.signature'), value: 'signature' });
  }
  if (hasBattlegroundsVariant.value) {
    opts.push({ label: t('hearthstone.card.variant.battlegrounds'), value: 'battlegrounds' });
  }

  return opts;
});

watch(isBattlegrounds, (v: boolean) => {
  if (v) variant.value = 'battlegrounds';
}, { immediate: true });

watch(hasBattlegroundsVariant, (v: boolean) => {
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
