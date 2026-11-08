<template>
  <div class="mx-auto max-w-6xl">
    <section
      :aria-label="$t('hearthstone.tagCatalog.title')"
      :aria-busy="status === 'pending'"
      :style="{ '--tag-filter-height': `${filterHeight}px` }"
      class="hs-surface-card overflow-clip rounded-xl"
    >
      <div ref="filters" class="sticky top-0 z-20 flex flex-wrap gap-2.5 bg-(--color-hs-surface-bg) p-3 sm:p-4">
        <UInput
          v-model="search"
          type="search"
          icon="i-lucide-search"
          maxlength="200"
          :placeholder="$t('hearthstone.tagCatalog.search')"
          :aria-label="$t('hearthstone.tagCatalog.search')"
          class="w-full min-[760px]:w-72"
        />
        <USelect
          v-model="projection"
          multiple
          :items="projectionOptions"
          :placeholder="$t('hearthstone.tagCatalog.allProjections')"
          icon="i-lucide-list-filter"
          :aria-label="$t('hearthstone.tagCatalog.filterProjection')"
          class="w-full min-w-0 min-[410px]:w-auto min-[410px]:min-w-40 min-[410px]:max-w-56"
        />
        <USelect
          v-model="valueType"
          multiple
          :items="valueTypeOptions"
          :placeholder="$t('hearthstone.tagCatalog.allValues')"
          icon="i-lucide-list-filter"
          :aria-label="$t('hearthstone.tagCatalog.filterValue')"
          class="w-full min-w-0 min-[410px]:w-auto min-[410px]:min-w-40 min-[410px]:max-w-56"
        />
        <USelect
          v-model="pageSize"
          :items="pageSizeOptions"
          :aria-label="$t('hearthstone.tagCatalog.pageSize')"
          class="w-full min-[410px]:w-auto min-[760px]:ml-auto"
        />
      </div>

      <div
        v-if="status === 'idle' || (status === 'pending' && !data)"
        role="status"
        class="flex items-center justify-center gap-2 border-t border-(--color-hs-surface-border) px-4 py-12"
      >
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
        {{ $t('hearthstone.tagCatalog.loading') }}
      </div>

      <div
        v-else-if="error"
        role="alert"
        class="grid justify-items-center gap-2 border-t border-(--color-hs-surface-border) px-4 py-12 text-center"
      >
        <p>{{ $t('hearthstone.tagCatalog.loadError') }}</p>
        <UButton type="button" variant="outline" @click="refresh()">
          {{ $t('hearthstone.tagCatalog.retry') }}
        </UButton>
      </div>

      <div
        v-else-if="!data?.items.length"
        role="status"
        class="grid justify-items-center gap-2 border-t border-(--color-hs-surface-border) px-4 py-12 text-center"
      >
        <p>{{ $t('hearthstone.tagCatalog.empty') }}</p>
        <UButton v-if="hasFilters" type="button" color="neutral" variant="ghost" @click="clearFilters">
          {{ $t('hearthstone.tagCatalog.clear') }}
        </UButton>
      </div>

      <template v-else>
        <table
          :aria-label="$t('hearthstone.tagCatalog.title')"
          class="block w-full table-fixed border-collapse text-left text-sm min-[760px]:table"
          role="table"
        >
          <thead
            class="hs-surface-panel sr-only min-[760px]:not-sr-only min-[760px]:sticky min-[760px]:top-(--tag-filter-height) min-[760px]:z-10 min-[760px]:table-header-group"
            role="rowgroup"
          >
            <tr role="row" class="border-y border-(--color-hs-surface-border) text-xs">
              <th scope="col" role="columnheader" class="w-[7%] px-3 py-2.5">{{ $t('hearthstone.tagCatalog.id') }}</th>
              <th scope="col" role="columnheader" class="w-[21%] px-3 py-2.5">{{ $t('hearthstone.tagCatalog.slug') }}</th>
              <th scope="col" role="columnheader" class="w-[15%] px-3 py-2.5">{{ $t('hearthstone.tagCatalog.projection') }}</th>
              <th scope="col" role="columnheader" class="w-[14%] px-3 py-2.5">{{ $t('hearthstone.tagCatalog.valueType') }}</th>
              <th scope="col" role="columnheader" class="px-3 py-2.5">{{ $t('hearthstone.tagCatalog.purpose') }}</th>
              <th scope="col" role="columnheader" class="w-25 px-3 py-2.5">{{ $t('hearthstone.tagCatalog.viewCards') }}</th>
            </tr>
          </thead>
          <tbody class="block min-[760px]:table-row-group" role="rowgroup">
            <tr
              v-for="tag in data.items"
              :key="tag.enumId"
              role="row"
              class="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1.5 border-t border-(--color-hs-surface-border) px-3 py-3 min-[760px]:table-row min-[760px]:border-t-0 min-[760px]:border-b min-[760px]:last:border-b-0"
            >
              <td role="cell" class="hs-subtle-text font-mono text-xs tabular-nums min-[760px]:px-3 min-[760px]:py-3">
                {{ tag.enumId }}
              </td>
              <td role="cell" class="col-span-2 min-[760px]:px-3 min-[760px]:py-3">
                <span class="font-mono wrap-anywhere">{{ tag.slug }}</span>
                <span v-if="tag.name" class="hs-subtle-text block text-xs wrap-anywhere">{{ tag.name }}</span>
              </td>
              <td role="cell" class="col-start-2 align-top min-[760px]:px-3 min-[760px]:py-3">
                <span aria-hidden="true" class="hs-subtle-text block text-xs min-[760px]:hidden">
                  {{ $t('hearthstone.tagCatalog.projection') }}
                </span>
                <div v-if="tag.projections.length" class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="kind in tag.projections"
                    :key="kind"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    class="max-w-full whitespace-normal"
                    :class="projectionStyles[kind]"
                  >
                    {{ $t(`hearthstone.tagCatalog.projections.${kind}`) }}
                  </UBadge>
                </div>
                <span v-else class="hs-subtle-text text-xs">{{ $t('hearthstone.tagCatalog.unclassified') }}</span>
              </td>
              <td role="cell" class="col-start-3 align-top min-[760px]:px-3 min-[760px]:py-3">
                <span aria-hidden="true" class="hs-subtle-text block text-xs min-[760px]:hidden">
                  {{ $t('hearthstone.tagCatalog.valueType') }}
                </span>
                <UBadge
                  v-if="tag.valueType"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  class="max-w-full whitespace-normal"
                  :class="valueTypeStyles[tag.valueType]"
                >
                  {{ $t(`hearthstone.tagCatalog.valueTypes.${tag.valueType}`) }}
                </UBadge>
                <span v-else class="hs-subtle-text text-xs">{{ $t('hearthstone.tagCatalog.unclassified') }}</span>
              </td>
              <td role="cell" class="col-span-full align-top min-[760px]:px-3 min-[760px]:py-3">
                <TagDescription v-if="tag.description" :text="tag.description" />
                <span v-else class="hs-subtle-text text-xs">{{ $t('hearthstone.tagCatalog.noDescription') }}</span>
              </td>
              <td
                role="cell"
                class="col-span-full align-top min-[760px]:table-cell min-[760px]:px-3 min-[760px]:py-3"
                :class="{ hidden: !tag.projections.includes('mechanic') }"
              >
                <NuxtLink
                  v-if="tag.projections.includes('mechanic')"
                  :to="{ path: '/search', query: { q: `#${tag.enumId}` } }"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-(--color-hs-chip-text) underline underline-offset-2"
                >
                  {{ $t('hearthstone.tagCatalog.viewCards') }}
                  <UIcon name="i-lucide-external-link" class="size-3 shrink-0" aria-hidden="true" />
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>

      </template>

      <footer v-if="data && !error" class="flex flex-wrap items-center justify-between gap-2 border-t border-(--color-hs-surface-border) px-3 py-2.5 sm:px-4">
        <p role="status" class="hs-subtle-text flex flex-wrap items-baseline gap-x-2 text-xs tabular-nums">
          <span v-if="data.items.length">
            {{ $t(data.items.length === 1 ? 'hearthstone.tagCatalog.rangeSingle' : 'hearthstone.tagCatalog.range', {
              first: n((data.page - 1) * data.pageSize + 1),
              last: n((data.page - 1) * data.pageSize + data.items.length),
              count: n(data.total),
            }) }}
          </span>
          <span v-if="!data.items.length || data.total !== data.catalogTotal">
            {{ $t('hearthstone.tagCatalog.total', { count: n(data.catalogTotal) }) }}
          </span>
        </p>
        <div v-if="pageCount > 1 && data.pageSize === pageSize" class="flex min-w-0 flex-wrap items-center gap-2">
          <UPagination
            :page="data.page"
            :total="data.total"
            :items-per-page="data.pageSize"
            :sibling-count="1"
            :aria-label="$t('hearthstone.tagCatalog.pagination')"
            :ui="{ list: 'flex-wrap' }"
            size="sm"
            @update:page="goToPage"
          />
          <form class="flex flex-wrap items-center gap-1.5" @submit.prevent="goToPage(Number(pageInput))">
            <label class="flex items-center gap-1 text-xs">
              <input
                v-model.number="pageInput"
                type="number"
                inputmode="numeric"
                min="1"
                :max="pageCount"
                required
                :aria-label="$t('hearthstone.tagCatalog.page')"
                class="w-13 rounded-md border border-(--color-hs-surface-border) bg-default px-1 py-1.5 text-center text-default"
              >
              <span>{{ $t('hearthstone.tagCatalog.pageCount', { count: n(pageCount) }) }}</span>
            </label>
            <UButton type="submit" color="neutral" variant="outline" size="sm">
              {{ $t('hearthstone.tagCatalog.jump') }}
            </UButton>
          </form>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { mainLocale } from '@tcg-cards/model/hearthstone/schema/basic';
import { tagSemanticValueKind, type TagSemanticValueKind } from '@tcg-cards/model/hearthstone/schema/tag';

import {
  tagCatalogPageSizes,
  tagCatalogProjection,
  type TagCatalogInput,
  type TagCatalogProjection,
} from '~~/shared/tag-catalog';

definePageMeta({ layout: 'main' });

const { t, n } = useI18n();
const { $orpc } = useNuxtApp();
const gameLocale = useGameLocale();
const route = useRoute();
const router = useRouter();
useTitle(() => t('hearthstone.tagCatalog.title'));

const lang = computed(() => mainLocale.safeParse(gameLocale.value).data ?? 'en');
const query = computed(() => readQueryValue(route.query.search).trim().slice(0, 200));
const search = ref(query.value);
const projection = computed({
  get: () => readQueryOptions(route.query.projection, tagCatalogProjection.options),
  set: value => replaceFilters({ projection: value }),
});
const valueType = computed({
  get: () => readQueryOptions(route.query.valueType, tagSemanticValueKind.options),
  set: value => replaceFilters({ valueType: value }),
});
const page = computed(() => {
  const value = Number(readQueryValue(route.query.page));
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
});
const pageSize = computed({
  get: () => tagCatalogPageSizes.find(size => size === Number(readQueryValue(route.query.pageSize))) ?? tagCatalogPageSizes[0],
  set: value => replaceFilters({ pageSize: value }),
});
const pageInput = ref<number | string>(1);

/** The normalized form of a repeated or scalar query parameter. */
type QueryValue = (typeof route.query)[string] | undefined;

/** A change to the catalog filters and page size. */
interface FilterChanges {
  projection?: TagCatalogProjection[];
  valueType?:  TagSemanticValueKind[];
  pageSize?:   TagCatalogInput['pageSize'];
}

/** Reads the first value of a query parameter intended to be scalar. */
function readQueryValue(raw: QueryValue) {
  return (Array.isArray(raw) ? raw[0] : raw) ?? '';
}

/** Keeps only supported options and ignores duplicates. */
function readQueryOptions<T extends string>(raw: QueryValue, options: readonly T[]) {
  const values = Array.isArray(raw) ? raw : [raw];
  return options.filter(option => values.includes(option));
}

const filters = useTemplateRef('filters');
const filterHeight = ref(0);
let filterObserver: ResizeObserver | undefined;

onMounted(() => {
  const element = filters.value;
  if (element == null) {
    return;
  }

  // The controls can wrap at different widths and in different languages.
  filterObserver = new ResizeObserver(() => {
    filterHeight.value = element.getBoundingClientRect().height;
  });
  filterObserver.observe(element, { box: 'border-box' });
});

onBeforeUnmount(() => filterObserver?.disconnect());

const projectionStyles = {
  field:     'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  mechanic:  'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  relation:  'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  localized: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  none:      'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
} satisfies Record<TagCatalogProjection, string>;

const valueTypeStyles = {
  boolean:        'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  number:         'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200',
  card_dbf_id:    'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  card_id:        'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200',
  subset_id:      'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
  set_id:         'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  deck_id:        'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  entity_id:      'bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200',
  tag_id:         'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200',
  enum:           'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  bitmask:        'bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200',
  text:           'bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-200',
  localized_text: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  multipurpose:   'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
} satisfies Record<TagSemanticValueKind, string>;

const projectionOptions = computed(() => tagCatalogProjection.options.map(value => ({
  value,
  label: t(`hearthstone.tagCatalog.projections.${value}`),
})));
const valueTypeOptions = computed(() => tagSemanticValueKind.options.map(value => ({
  value,
  label: t(`hearthstone.tagCatalog.valueTypes.${value}`),
})));
const pageSizeOptions = computed(() => tagCatalogPageSizes.map(value => ({
  value,
  label: t('hearthstone.tagCatalog.perPage', { count: n(value) }),
})));

const hasFilters = computed(() => search.value !== '' || projection.value.length > 0 || valueType.value.length > 0);

watch(() => route.fullPath, () => {
  if (search.value.trim() !== query.value) {
    search.value = query.value;
  }
});

watch(search, (value, _, onCleanup) => {
  const timer = setTimeout(() => {
    if (value.trim() !== query.value) {
      replaceFilters();
    }
  }, 200);
  onCleanup(() => clearTimeout(timer));
});

watch(lang, () => {
  if (page.value !== 1) {
    replaceFilters();
  }
});

const { data, status, error, refresh } = useAsyncData(
  'hearthstone-tag-catalog',
  (_, { signal }) => $orpc.hearthstone.tag.list({
    q:          query.value,
    lang:       lang.value,
    projection: projection.value,
    valueType:  valueType.value,
    page:       page.value,
    pageSize:   pageSize.value,
  }, { signal }),
  { watch: [query, projection, valueType, lang, page, pageSize] },
);

const pageCount = computed(() => data.value == null ? 1 : Math.max(1, Math.ceil(data.value.total / data.value.pageSize)));

watch(data, result => {
  pageInput.value = result?.page ?? 1;
}, { immediate: true });

/** Saves filters in the current history entry and resets pagination. */
function replaceFilters(changes: FilterChanges = {}) {
  const nextSearch = search.value.trim();
  const nextProjection = changes.projection ?? projection.value;
  const nextValueType = changes.valueType ?? valueType.value;
  const nextPageSize = changes.pageSize ?? pageSize.value;

  void router.replace({
    query: {
      ...route.query,
      search:     nextSearch === '' ? undefined : nextSearch,
      projection: nextProjection.length ? nextProjection : undefined,
      valueType:  nextValueType.length ? nextValueType : undefined,
      page:       undefined,
      pageSize:   nextPageSize === tagCatalogPageSizes[0] ? undefined : nextPageSize,
    },
    hash: route.hash,
  });
}

/** Clears the search and classifications together. */
function clearFilters() {
  search.value = '';
  replaceFilters({ projection: [], valueType: [] });
}

/** Changes the displayed page and makes it available to browser history. */
function goToPage(target: number) {
  if (!Number.isInteger(target)) {
    return;
  }

  if (search.value.trim() !== query.value) {
    replaceFilters();
    return;
  }

  const next = Math.min(Math.max(target, 1), pageCount.value);
  pageInput.value = next;
  void router.push({
    query: { ...route.query, page: next === 1 ? undefined : next },
    hash:  route.hash,
  });
}
</script>
