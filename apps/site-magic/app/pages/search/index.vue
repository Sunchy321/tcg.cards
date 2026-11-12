<template>
  <div>
    <Teleport to="#subheader-portal" defer>
      <div class="controller h-12 flex items-center gap-3 px-4 shadow-md">
        <UIcon v-show="searching" name="lucide:refresh-cw" class="animate-spin text-white/80 shrink-0" />

        <SearchAmbitLanding
          v-if="data != null"
          :ambit="landingAmbit"
          :widened="widened"
        />

        <RichText class="text-white/90 text-sm">
          {{ explained.text }}
        </RichText>

        <div class="flex-1" />

        <span v-if="data != null" class="font-mono text-sm text-white/70">{{ total }}</span>

        <SearchTimingPopover
          :request-elapsed="requestElapsed"
          :timing="serverTiming"
          :render-elapsed="renderElapsed"
          :labels="timingLabels"
        />

        <UPagination
          v-if="pageCount > 0"
          :page="page"
          :total="total"
          :items-per-page="pageSize"
          size="sm"
          @update:page="changePage"
        />
      </div>
    </Teleport>

    <!-- Query errors -->
    <div v-if="errorTexts.length > 0" class="mt-16 py-4 px-12 flex justify-center">
      <div class="max-w-xl w-fit p-3 rounded-lg bg-yellow-100 dark:bg-yellow-500/20 border border-yellow-300 dark:border-yellow-400/40 text-yellow-700 dark:text-yellow-200 text-sm flex items-start gap-2">
        <UIcon name="lucide:alert-triangle" class="shrink-0 mt-0.5" />
        <div class="flex flex-col gap-1">
          <span v-for="(text, i) in errorTexts" :key="i">{{ text }}</span>
        </div>
      </div>
    </div>

    <!-- Card grid -->
    <div class="result mt-16 py-4 px-12 flex flex-wrap justify-center gap-2">
      <NuxtLink
        v-for="card in cards"
        :key="`${card.cardId}:${card.set}:${card.number}:${card.lang}:${card.partIndex}`"
        :to="cardLink(card)"
        target="_blank"
        class="block"
      >
        <CardImage
          :set="card.set"
          :number="card.number"
          :lang="imageLang(card)"
          :layout="card.print.layout"
          :image-type="card.print.imageType"
          :image-status="card.print.imageStatus"
          :part="card.partIndex"
          class="w-50"
        />
        <div class="mt-1 px-1 text-center text-sm text-white/80 truncate w-50" :lang="card.locale">
          <NameRuby :name="card.cardPartLocalization.name" :ruby="card.cardPartLocalization.rubyName" />
        </div>
      </NuxtLink>
      <div v-for="i in 20" :key="`dummy-${i}`" class="w-50" aria-hidden="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EssentialCardSearchItem, EssentialSearchResult } from '#model/magic/schema/search';

import { explain as model } from '~/search';
import { detectAmbit, AMBITS } from '#search/ambit';
import type { Ambit } from '#search/ambit';

definePageMeta({
  layout:    'main',
  game:      'magic',
  titleType: 'input',
});

const { $orpc } = useNuxtApp();
const route = useRoute('search');
const router = useRouter();
const i18n = useI18n();
const gameLocale = useGameLocale();
useTitle(() => i18n.t('magic.$self'));

const data = ref<EssentialSearchResult | null>(null);
const searching = ref(false);
const requestElapsed = ref<number | null>(null);
const renderElapsed = ref<number | null>(null);
const serverTiming = ref<NonNullable<EssentialSearchResult['timing']> | null>(null);
let searchRequestSequence = 0;

// ── Query params ──────────────────────────────────────────────────────────────

const q = computed(() => route.query.q as string | undefined);

const page = computed(() => {
  const v = Number(route.query.page);
  return Number.isFinite(v) && v >= 1 ? v : 1;
});

const pageSize = computed(() => {
  const v = Number(route.query.pageSize);
  return Number.isFinite(v) && v >= 1 ? v : 100;
});

// ── Derived state ─────────────────────────────────────────────────────────────

const explained = computed(() => model.explain(q.value ?? '', (key: string, named?: Record<string, any>) => {
  let realKey: string;

  if (key.startsWith('#.')) {
    realKey = `magic.${key.slice(2)}`;
  } else if (key.startsWith('$.')) {
    realKey = `magic.search.${key.slice(2)}`;
  } else {
    realKey = `search.${key}`;
  }

  return named != null ? i18n.t(realKey, named) : i18n.t(realKey);
}));

const cards = computed<EssentialCardSearchItem[]>(() => data.value?.result?.result ?? []);
const total = computed(() => data.value?.result?.total ?? 0);
const pageCount = computed(() => data.value?.result?.totalPage ?? Math.ceil(total.value / pageSize.value));

/** The ambit URL param as its ladder level; null when absent. */
const ambitLevel = useAmbitParam();

/** The ceiling the query asked for: an ambit command in the DSL overrides the
 * URL param, and an explicit command that pins nothing falls back to the
 * default primary ambit (still without widening). */
const requestedAmbit = computed<Ambit>(() => {
  const dsl = detectAmbit(q.value ?? '');
  return dsl.pinned ?? (dsl.explicit ? 'primary' : ambitLevel.value ?? 'primary');
});

/** The ambit the search actually landed on, as reported by the response. */
const landingAmbit = computed<Ambit>(() => data.value?.result?.ambit ?? 'primary');

/** True when stepwise widening moved the results past the requested ceiling —
 * the only situation where the landing needs to be called out. */
const widened = computed(() =>
  AMBITS.indexOf(landingAmbit.value) > AMBITS.indexOf(requestedAmbit.value));

// Server-side query errors (parse and validation); unknown types fall back to a generic message.
const errorTexts = computed(() => (data.value?.errors ?? []).map((e: any) => {
  const key = `search.error.${e.type}`;
  return i18n.te(key) ? i18n.t(key, e.payload ?? {}) : i18n.t('search.error.fallback');
}));

/** Resolves a Magic search phase to localized wording without exposing its key. */
const timingStageLabel = (key: string) => {
  const labels: Record<string, string> = {
    'dataset-status-check':     'datasetStatus',
    'query-preparation':        'queryPreparation',
    'legacy-translation':       'queryTranslation',
    'route-selection':          'querySelection',
    'local-route-selection':    'querySelection',
    'query-compilation':        'queryPreparation',
    'database-result-query':    'matchingCards',
    'database-count-query':     'countMatches',
    'database-search-query':    'matchingAndCounting',
    'database-page-query':      'matchingAndCounting',
    'database-candidate-query': 'candidateCards',
    'candidate-id-shaping':     'prepareMatches',
    'result-shaping':           'prepareResults',
    'essential-result-shaping': 'prepareResults',
  };

  return i18n.t(`magic.search.timing.stages.${labels[key] ?? 'other'}`);
};

/** Supplies Magic's localized copy to the shared timing popover. */
const timingLabels = computed(() => ({
  open:       i18n.t('magic.search.timing.open'),
  title:      i18n.t('magic.search.timing.title'),
  request:    i18n.t('magic.search.timing.request'),
  server:     i18n.t('magic.search.timing.server'),
  pageUpdate: i18n.t('magic.search.timing.pageUpdate'),
  stageLabel: timingStageLabel,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const imageLang = (card: EssentialCardSearchItem): string => {
  if (card.print.imageStatus !== 'placeholder') {
    return card.lang;
  }
  return 'en';
};

const cardLink = (card: EssentialCardSearchItem) =>
  `/card/${card.cardId}?set=${card.set}&number=${card.number}&locale=${card.locale}&part=${card.partIndex}`;

const changePage = (newPage: number) => {
  if (page.value !== newPage) {
    router.replace({ query: { ...route.query, page: newPage } });
  }
};

// ── Search ────────────────────────────────────────────────────────────────────

/** Records the Vue and browser-frame delay after a response is applied. */
const measureResultUpdate = async (sequence: number, startedAt: number) => {
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  if (sequence === searchRequestSequence) {
    renderElapsed.value = performance.now() - startedAt;
  }
};

/** Searches the current route query and keeps only the latest request's data and timings. */
const doSearch = async () => {
  const sequence = ++searchRequestSequence;

  if (!q.value) {
    data.value = null;
    requestElapsed.value = null;
    renderElapsed.value = null;
    serverTiming.value = null;
    searching.value = false;
    return;
  }

  requestElapsed.value = null;
  renderElapsed.value = null;
  serverTiming.value = null;
  searching.value = true;
  const requestStartedAt = import.meta.client ? performance.now() : null;

  try {
    const value = await ($orpc as any).magic.search.essential({
      q:        q.value,
      lang:     gameLocale.value,
      page:     page.value,
      pageSize: pageSize.value,
      ambit:    ambitLevel.value ?? undefined,
    });

    if (sequence === searchRequestSequence) {
      const receivedAt = requestStartedAt == null ? null : performance.now();
      data.value = value;
      serverTiming.value = value.timing ?? null;
      if (requestStartedAt != null && receivedAt != null) {
        requestElapsed.value = receivedAt - requestStartedAt;
        void measureResultUpdate(sequence, receivedAt);
      }
    }
  } catch (e) {
    if (sequence === searchRequestSequence) {
      console.error('Search failed', e);
      serverTiming.value = null;
      if (requestStartedAt != null) {
        requestElapsed.value = performance.now() - requestStartedAt;
      }
    }
  } finally {
    if (sequence === searchRequestSequence) {
      searching.value = false;
    }
  }
};

watch([q, page, pageSize, ambitLevel], doSearch, { immediate: true });
</script>

<style lang="scss" scoped>
.controller {
  background-color: rgba(79, 70, 229, 0.85);
  backdrop-filter: blur(8px);
}
</style>
