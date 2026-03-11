<template>
  <div>
    <Teleport to="#subheader-portal" defer>
      <div class="controller h-12 flex items-center px-4 shadow-md">
        <UIcon v-show="searching" name="lucide:refresh-cw" class="animate-spin mr-2 text-white/80" />

        <RichText class="text-white/90 text-sm">
          {{ explained.text }}
        </RichText>

        <div class="flex-1" />

        <span v-if="data != null" class="font-mono mr-4 text-white/60 text-sm">{{ total }}</span>

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
          :full-image-type="card.print.fullImageType"
          :image-status="card.print.imageStatus"
          :part="card.partIndex"
          class="w-50"
        />
        <div class="mt-1 px-1 text-center text-sm text-white/80 truncate w-50">
          {{ card.cardPartLocalization.name }}
        </div>
      </NuxtLink>
      <div v-for="i in 20" :key="`dummy-${i}`" class="w-50" aria-hidden="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CardPrintView } from '#model/magic/schema/print';
import type { SearchResult } from '#model/magic/schema/search';

import { explain as model } from '~/search';

definePageMeta({
  layout:    'main',
  game:      'magic',
  titleType: 'input',
});

const { $orpc } = useNuxtApp();
const route = useRoute('search');
const router = useRouter();
const i18n = useI18n();
const title = useTitle();
const gameLocale = useGameLocale('magic');

title.value = i18n.t('magic.$self');

const data = ref<SearchResult | null>(null);
const searching = ref(false);

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

const cards = computed<CardPrintView[]>(() => (data.value?.result?.result ?? []) as CardPrintView[]);
const total = computed(() => data.value?.result?.total ?? 0);
const pageCount = computed(() => data.value?.result?.totalPage ?? Math.ceil(total.value / pageSize.value));

// ── Helpers ───────────────────────────────────────────────────────────────────

const imageLang = (card: CardPrintView): string => {
  if (card.print.imageStatus !== 'placeholder') {
    return card.lang;
  }
  return 'en';
};

const cardLink = (card: CardPrintView) =>
  `/card/${card.cardId}?set=${card.set}&number=${card.number}&lang=${card.lang}&part=${card.partIndex}`;

const changePage = (newPage: number) => {
  if (page.value !== newPage) {
    router.replace({ query: { ...route.query, page: newPage } });
  }
};

// ── Search ────────────────────────────────────────────────────────────────────

const doSearch = async () => {
  if (!q.value) {
    data.value = null;
    return;
  }

  searching.value = true;

  try {
    const value = await ($orpc as any).magic.search.basic({
      q:        q.value,
      lang:     gameLocale.value,
      page:     page.value,
      pageSize: pageSize.value,
    });

    // Only update if query is still the same (avoid stale responses)
    if (value.text === q.value || q.value === route.query.q) {
      data.value = value;
    }
  } catch (e) {
    console.error('Search failed', e);
  } finally {
    searching.value = false;
  }
};

watch([q, page, pageSize], doSearch, { immediate: true });
</script>

<style lang="scss" scoped>
.controller {
  background-color: rgba(79, 70, 229, 0.85);
  backdrop-filter: blur(8px);
}
</style>
