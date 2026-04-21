<template>
  <div>
    <Teleport to="#subheader-portal">
      <div class="controller h-12 flex items-center gap-3 px-4 shadow-md">
        <UIcon
          v-show="searching"
          name="lucide:refresh-cw"
          class="animate-spin text-white/80 shrink-0"
        />

        <span class="text-sm text-white/90 truncate">
          {{ explainText }}
        </span>

        <div class="flex-1" />

        <span v-if="data != null" class="font-mono text-sm text-white/70 shrink-0">
          {{ total }}
        </span>

        <UPagination
          v-if="pageCount > 1"
          :page="page"
          :total="total"
          :items-per-page="pageSize"
          size="sm"
          @update:page="changePage"
        />
      </div>
    </Teleport>

    <div class="mx-auto max-w-6xl px-4 py-6 mt-16">
      <div class="mb-6 flex flex-wrap gap-3">
        <UButton
          icon="lucide:sliders-horizontal"
          variant="soft"
          to="/search/advanced"
        >
          {{ $t('hearthstone.search.advanced.$self') }}
        </UButton>

        <UButton
          icon="lucide:library"
          variant="soft"
          :to="{ path: '/search', query: { q: 'order:set+,name+' } }"
        >
          {{ $t('hearthstone.search.advanced.browseSets') }}
        </UButton>
      </div>

      <div v-if="!q" class="flex flex-col items-center justify-center py-24 text-center text-gray-500 gap-3">
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
            :to="{ path: '/search', query: { q: 'order:set+,name+' } }"
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

      <div v-else-if="data != null && cards.length === 0" class="flex flex-col items-center justify-center py-24 text-center text-gray-500 gap-3">
        <UIcon name="lucide:search-x" class="text-5xl" />
        <p class="text-lg font-medium">{{ $t('hearthstone.search.noResult') }}</p>
        <p>{{ q }}</p>
      </div>

      <div v-else class="flex flex-col gap-4">
        <NuxtLink
          v-for="card in cards"
          :key="`${card.cardId}:${card.lang}`"
          :to="cardLink(card)"
          class="block"
        >
          <UCard class="hover:ring-2 hover:ring-primary/30 transition">
            <div class="flex flex-col gap-4 sm:flex-row">
              <div class="w-30 shrink-0 self-center sm:self-start">
                <CardImage
                  :card-id="card.cardId"
                  :version="minVersion(card)"
                />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-col gap-3 md:flex-row md:items-start">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start gap-3">
                      <h2 class="text-xl font-semibold leading-tight break-words">
                        {{ card.localization.name }}
                      </h2>

                      <div
                        v-if="card.cost != null"
                        class="shrink-0 rounded-full bg-primary text-white text-sm font-bold w-8 h-8 flex items-center justify-center"
                      >
                        {{ card.cost }}
                      </div>
                    </div>

                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {{ subtitle(card) }}
                    </p>

                    <p
                      v-if="previewText(card)"
                      class="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
                    >
                      {{ previewText(card) }}
                    </p>
                  </div>

                  <div class="flex flex-wrap gap-2 md:max-w-52 md:justify-end">
                    <UBadge v-if="stats(card)" color="neutral" variant="subtle">
                      {{ stats(card) }}
                    </UBadge>
                    <UBadge color="neutral" variant="subtle">
                      {{ card.set }}
                    </UBadge>
                    <UBadge color="neutral" variant="subtle">
                      {{ $te(`lang.${card.lang}`) ? $t(`lang.${card.lang}`) : card.lang }}
                    </UBadge>
                    <UBadge
                      v-for="klass in card.classes"
                      :key="klass"
                      color="primary"
                      variant="soft"
                    >
                      {{ classText(klass) }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CardEntityView } from '#model/hearthstone/schema/entity';
import type { NormalResult } from '#model/hearthstone/schema/search';

import { explain as model } from '~/search';

definePageMeta({
  layout:    'main',
  titleType: 'input',
  actions:   [getHearthstoneActionMeta().random],
});

type SearchResponse = {
  text?: string;
  result?: NormalResult;
  errors?: Array<{ type?: string; payload?: Record<string, any> }>;
};

const { $orpc } = useNuxtApp();
const route = useRoute('search');
const router = useRouter();
const gameLocale = useGameLocale();
const { setActions } = useActions();
const actions = useHearthstoneActions();
const i18n = useI18n();

setActions([actions.random]);
useTitle(() => i18n.t('hearthstone.search.$self'));

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

  return explained.value.text;
});

const cards = computed<CardEntityView[]>(() => data.value?.result?.result ?? []);
const total = computed(() => data.value?.result?.total ?? 0);
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

  if (card.armor != null) {
    return `[${card.armor}]`;
  }

  if (card.colddown != null) {
    return `#${card.colddown}`;
  }

  return null;
};

const minVersion = (card: CardEntityView) => {
  return Math.min(...card.version);
};

const previewText = (card: CardEntityView) => {
  const text = card.localization.displayText || card.localization.text || '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 180);
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
      lang:     gameLocale.value,
      page:     page.value,
      pageSize: pageSize.value,
    });

    if (q.value === route.query.q) {
      data.value = result as SearchResponse;
    }
  } catch {
    data.value = null;
    fetchError.value = i18n.t('hearthstone.search.failed');
  } finally {
    searching.value = false;
  }
};

watch([q, page, pageSize, gameLocale], doSearch, { immediate: true });
</script>

<style lang="scss" scoped>
.controller {
  background-color: rgba(217, 119, 6, 0.88);
  backdrop-filter: blur(8px);
}
</style>
