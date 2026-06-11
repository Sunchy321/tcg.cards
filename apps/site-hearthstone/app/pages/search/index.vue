<template>
  <div>
    <Teleport v-if="subheaderReady" to="#subheader-portal">
      <div class="controller flex min-h-12 flex-wrap items-center gap-3 px-4 py-2 shadow-md">
        <UIcon
          v-show="searching"
          name="lucide:refresh-cw"
          class="animate-spin text-white/80 shrink-0"
        />

        <span class="result-count min-w-0 flex-1 truncate">
          <template v-if="data != null">{{ displayTotal }}</template>
        </span>

        <div class="result-tools">
          <USelect
            v-if="q"
            :model-value="selectedOrder"
            :items="sortOptions"
            :placeholder="$t('hearthstone.search.command.order')"
            size="sm"
            class="sort-select shrink-0"
            trailing-icon="lucide:chevron-down"
            :ui="{ base: 'sort-select-base font-semibold', content: 'min-w-36' }"
            @update:model-value="changeOrder($event as string)"
          />

          <UPagination
            v-if="pageCount > 1"
            :page="page"
            :total="total"
            :items-per-page="pageSize"
            size="sm"
            @update:page="changePage"
          />
        </div>
      </div>
    </Teleport>

    <div class="mx-auto max-w-6xl px-4 py-6 mt-6">
      <div class="mb-6 flex flex-wrap gap-3">
        <UButton
          icon="lucide:sliders-horizontal"
          variant="soft"
          class="search-shortcut"
          to="/search/advanced"
        >
          {{ $t('hearthstone.search.advanced.$self') }}
        </UButton>

        <UButton
          icon="lucide:library"
          variant="soft"
          class="search-shortcut"
          to="/sets"
        >
          {{ $t('hearthstone.search.advanced.browseSets') }}
        </UButton>
      </div>

      <div v-if="!q" class="hs-subtle-text flex flex-col items-center justify-center py-24 text-center gap-3">
        <UIcon name="lucide:search" class="text-5xl" />
        <p class="text-lg font-medium">{{ $t('hearthstone.search.emptyQuery') }}</p>
        <p>{{ $t('hearthstone.search.hint') }}</p>
        <div class="mt-3 flex flex-wrap justify-center gap-3">
          <UButton
            icon="lucide:sliders-horizontal"
            to="/search/advanced"
          >
            {{ $t('hearthstone.search.advanced.$self') }}
          </UButton>

          <UButton
            icon="lucide:library"
            variant="soft"
            to="/sets"
          >
            {{ $t('hearthstone.search.advanced.browseSets') }}
          </UButton>
        </div>
      </div>

      <div v-else-if="errorText" class="mb-6">
        <UAlert
          color="error"
          variant="soft"
          icon="lucide:circle-alert"
          :title="$t('hearthstone.search.failed')"
          :description="errorText"
        />
      </div>

      <div v-else-if="data != null && cards.length === 0" class="hs-subtle-text flex flex-col items-center justify-center py-24 text-center gap-3">
        <UIcon name="lucide:search-x" class="text-5xl" />
        <p class="text-lg font-medium">{{ $t('hearthstone.search.noResult') }}</p>
        <p>{{ q }}</p>
      </div>

      <div v-else class="flex flex-col gap-4">
        <NuxtLink
          v-for="card in cards"
          :key="`${card.cardId}:${card.lang}`"
          :to="cardLink(card)"
          :prefetch="false"
          class="block"
        >
          <article class="hs-surface-card result-card rounded-lg p-4 transition hover:ring-2 hover:ring-primary/30">
            <div class="flex flex-col gap-4 sm:flex-row">
              <div class="w-30 shrink-0 self-center sm:self-start">
                <ClientOnly>
                  <CardImage
                    :card-id="card.cardId"
                    :version="minVersion(card)"
                    :lang="card.lang"
                    :render-hash="card.renderHash"
                  />
                  <template #fallback>
                    <div class="hs-card-image-shell aspect-68/94 w-full rounded-lg animate-pulse" />
                  </template>
                </ClientOnly>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-col gap-3 md:flex-row md:items-start">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start gap-3">
                      <h2 class="text-xl font-semibold leading-tight break-words">
                        {{ card.localization.name }}
                      </h2>

                      <ManaCost
                        v-if="card.cost != null"
                        :value="card.cost"
                        size="sm"
                      />
                    </div>

                    <p class="hs-subtle-text mt-1 text-sm">
                      {{ subtitle(card) }}
                    </p>

                    <p
                      v-if="previewText(card)"
                      class="mt-3 text-sm leading-6 whitespace-pre-wrap"
                    >
                      {{ previewText(card) }}
                    </p>
                  </div>

                  <div class="flex flex-wrap gap-2 md:max-w-52 md:justify-end">
                    <ArmorValue v-if="card.armor != null" :value="card.armor" :size="30" />
                    <UBadge v-else-if="stats(card)" class="hs-chip" color="neutral" variant="subtle">
                      {{ stats(card) }}
                    </UBadge>
                    <UBadge v-if="setText(card.set)" class="hs-chip" color="neutral" variant="subtle">
                      {{ setText(card.set) }}
                    </UBadge>
                    <UBadge
                      v-for="klass in card.classes"
                      :key="klass"
                      class="hs-chip"
                      color="primary"
                      variant="soft"
                    >
                      {{ classText(klass) }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CardEntityView } from '#model/hearthstone/schema/entity';
import type { NormalResult } from '#model/hearthstone/schema/search';
import { locale as localeSchema } from '#model/hearthstone/schema/basic';

import { explain as model } from '~/search';

definePageMeta({
  layout:    'main',
  titleType: 'input',
  actions:   [getHearthstoneActionMeta().random],
});

type SearchResponse = {
  text?:   string;
  result?: NormalResult;
  errors?: Array<{ type?: string, payload?: Record<string, any> }>;
};

const { $orpc } = useNuxtApp();
const route = useRoute('search');
const router = useRouter();
const { setActions } = useActions();
const actions = useHearthstoneActions();
const i18n = useI18n();

setActions([actions.random]);
useTitle(() => i18n.t('hearthstone.search.$self'));

const subheaderReady = ref(false);

onMounted(() => {
  subheaderReady.value = true;
});

const data = ref<SearchResponse | null>(null);
const searching = ref(false);
const fetchError = ref<string | null>(null);

const q = computed(() => route.query.q as string | undefined);

const page = computed(() => {
  const value = Number(route.query.page);
  return Number.isFinite(value) && value >= 1 ? value : 1;
});

const pageSize = computed(() => {
  const value = Number(route.query.pageSize);
  return Number.isFinite(value) && value >= 1 ? value : 50;
});

const searchLang = computed(() =>
  localeSchema.safeParse(route.query.lang as string).data ?? 'zhs',
);

const explained = computed(() => model.explain(q.value ?? '', (key: string, named?: Record<string, any>) => {
  const realKey = key.startsWith('$.')
    ? `hearthstone.search.${key.slice(2)}`
    : key.startsWith('#.')
      ? `hearthstone.${key.slice(2)}`
      : `search.${key}`;

  return named != null ? i18n.t(realKey, named) : i18n.t(realKey);
}));

const explainText = computed(() => {
  if (!q.value) {
    return i18n.t('hearthstone.search.hint');
  }

  return replaceSetIds(explained.value.text);
});

const rawCards = computed<CardEntityView[]>(() =>
  data.value?.result?.result ?? [],
);

const cards = computed<CardEntityView[]>(() => {
  const byKey = new Map<string, CardEntityView>();

  for (const card of rawCards.value) {
    const key = displayKey(card);
    const existing = byKey.get(key);

    if (existing != null && hasKnownSet(existing)) {
      continue;
    }

    if (existing == null || hasKnownSet(card)) {
      byKey.set(key, card);
    }
  }

  return [...byKey.values()];
});
const total = computed(() => data.value?.result?.total ?? 0);
const displayTotal = computed(() => total.value <= pageSize.value ? cards.value.length : total.value);
const pageCount = computed(() => data.value?.result?.totalPage ?? Math.ceil(total.value / pageSize.value));

const errorText = computed(() => {
  if (fetchError.value != null) {
    return fetchError.value;
  }

  if (explained.value.type === 'error') {
    return explained.value.text;
  }

  const firstError = data.value?.errors?.[0];

  if (firstError?.type != null) {
    return i18n.te(`search.error.${firstError.type}`)
      ? i18n.t(`search.error.${firstError.type}`, firstError.payload ?? {})
      : i18n.t('hearthstone.search.failed');
  }

  if (data.value?.errors?.length) {
    return i18n.t('hearthstone.search.failed');
  }

  return null;
});

const cardLink = (card: CardEntityView) => ({
  path:  `/card/${card.cardId}`,
  query: { lang: card.lang },
});

const changePage = (nextPage: number) => {
  if (nextPage === page.value) {
    return;
  }

  void router.replace({
    query: {
      ...route.query,
      page: nextPage,
    },
  });
};

// Search result sort choices exposed in the compact sticky toolbar.
type SortOption = {
  value: 'cost' | 'attack' | 'health';
  label: string;
  icon:  string;
};

const sortOptions = computed<SortOption[]>(() => [
  {
    value: 'cost',
    label: i18n.t('hearthstone.search.command.cost'),
    icon:  'lucide:gem',
  },
  {
    value: 'attack',
    label: i18n.t('hearthstone.search.command.attack'),
    icon:  'lucide:swords',
  },
  {
    value: 'health',
    label: i18n.t('hearthstone.search.command.health'),
    icon:  'lucide:heart',
  },
]);

const currentOrder = computed(() => {
  const order = q.value?.match(/(?:^|\s)order:([^\s]+)/i)?.[1]?.toLowerCase();
  return order?.replace(/[+-]$/, '') ?? 'name';
});

const selectedOrder = computed<SortOption['value'] | undefined>(() =>
  sortOptions.value.some((option: SortOption) => option.value === currentOrder.value) ? currentOrder.value : undefined);

// Replaces the current order token while preserving the rest of the query.
const changeOrder = (order: string) => {
  if (order.length === 0) {
    return;
  }

  const tokens = (q.value ?? '').split(/\s+/).filter((token: string) => token.length > 0 && !/^order:/i.test(token));

  void router.replace({
    query: {
      ...route.query,
      q:    [...tokens, `order:${order}+`].join(' '),
      page: undefined,
    },
  });
};

const classText = (value: string) => {
  return i18n.te(`hearthstone.class.${value}`)
    ? i18n.t(`hearthstone.class.${value}`)
    : value;
};

const typeText = (value: string) => {
  return i18n.te(`hearthstone.card.type.${value}`)
    ? i18n.t(`hearthstone.card.type.${value}`)
    : value;
};

const setText = (value: string) => {
  const key = `hearthstone.set.${value}`;

  if (i18n.te(key)) {
    return i18n.t(key);
  }

  return /^SET_\d+$/.test(value) ? null : value;
};

// Keeps generated explanations user-facing by replacing internal set ids with localized names.
const replaceSetIds = (text: string) =>
  text.replace(/\b(?:CORE|SET_\d+)\b/g, value => setText(value) ?? '');

const hasKnownSet = (card: CardEntityView) => setText(card.set) != null;

const subtitle = (card: CardEntityView) => {
  const parts = [
    typeText(card.type),
    ...card.classes.map(classText),
  ];

  if (card.race?.length) {
    parts.push(card.race.map(r => i18n.te(`hearthstone.card.race.${r}`) ? i18n.t(`hearthstone.card.race.${r}`) : r).join('/'));
  }

  if (card.spellSchool != null) {
    parts.push(i18n.te(`hearthstone.card.spellSchool.${card.spellSchool}`)
      ? i18n.t(`hearthstone.card.spellSchool.${card.spellSchool}`)
      : card.spellSchool);
  }

  return parts.join(' · ');
};

const stats = (card: CardEntityView) => {
  if (card.attack != null && card.health != null) {
    return `${card.attack}/${card.health}`;
  }

  if (card.attack != null && card.durability != null) {
    return `${card.attack}/${card.durability}`;
  }

  if (card.colddown != null) {
    return `#${card.colddown}`;
  }

  return null;
};

// Reprints can have different card IDs while presenting the same playable card.
const displayKey = (card: CardEntityView) => [
  card.localization.name,
  card.type,
  card.cost ?? '',
  card.attack ?? '',
  card.health ?? '',
  card.durability ?? '',
  card.armor ?? '',
  card.colddown ?? '',
  card.localization.displayText ?? card.localization.text ?? '',
  card.classes.join('|'),
  card.race?.join('|') ?? '',
  card.spellSchool ?? '',
].join('\u001f');

const minVersion = (card: CardEntityView) => {
  return Math.min(...card.version);
};

const previewText = (card: CardEntityView) => {
  const text = card.localization.displayText ?? card.localization.text ?? '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\[\/?[bi]\]/gi, '')
    .replace(/\$[a-z]+(\d+)/gi, '$1')
    .replace(/#(\d+)/g, '$1')
    .replace(/\s*[(（]?\{\d+\}[)）]?/g, '')
    .replace(/\s+([.,!?;:。！？；：])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
};

const doSearch = async () => {
  if (!q.value) {
    data.value = null;
    fetchError.value = null;
    return;
  }

  searching.value = true;
  fetchError.value = null;

  try {
    const result = await $orpc.hearthstone.search.basic({
      q:        q.value,
      lang:     searchLang.value,
      page:     page.value,
      pageSize: pageSize.value,
    });

    if (q.value === route.query.q) {
      data.value = result as SearchResponse;
    }
  } catch (error) {
    console.error('[search] failed:', error);
    data.value = null;
    fetchError.value = i18n.t('hearthstone.search.failed');
  } finally {
    searching.value = false;
  }
};

watch([q, page, pageSize, searchLang], doSearch, { immediate: true });
</script>

<style lang="scss" scoped>
.controller {
  background-color: var(--color-app-header-bg);
  border-bottom: 1px solid var(--color-app-header-border);
  backdrop-filter: blur(8px);
}

.result-count {
  color: rgb(255 244 218 / 0.86);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.875rem;
  font-weight: 800;
}

.result-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  gap: 0.55rem;
}

.search-shortcut {
  border-color: color-mix(in srgb, var(--color-hs-chip-border) 70%, transparent);
  background: color-mix(in srgb, var(--color-hs-chip-bg) 76%, transparent);
  color: var(--color-hs-chip-text);
  font-weight: 700;
}

.result-card {
  display: block;
}

.sort-select {
  width: 5.7rem;
}

@media (max-width: 640px) {
  .result-tools {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
