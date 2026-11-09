<template>
  <section class="rounded-xl bg-default p-4 text-default sm:p-7">
    <header class="sticky top-0 z-30 -mx-4 -mt-4 mb-6 grid gap-4 rounded-t-xl border-b border-default bg-default px-4 py-4 sm:-mx-7 sm:-mt-7 sm:px-7 lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-6" data-series-header>
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ t('seriesCatalog.title') }}</h1>
      </div>
      <div class="flex flex-wrap gap-2">
        <UInput
          v-model="filters.query"
          icon="lucide:search"
          :placeholder="t('seriesCatalog.search')"
          :aria-label="t('seriesCatalog.search')"
          class="w-full sm:min-w-48 sm:flex-1"
        />
        <USelect v-model="year" :items="years" :aria-label="t('seriesCatalog.year')" class="min-w-32 flex-1 sm:flex-none" />
        <USelect v-model="filters.sort" :items="sorts" :aria-label="t('seriesCatalog.sort')" class="min-w-40 flex-1 sm:flex-none" />
      </div>
    </header>

    <div class="grid gap-6 lg:grid-cols-[10rem_minmax(0,1fr)]">
      <aside class="lg:border-r lg:border-default lg:pr-5">
        <div v-if="showMajorFilter" class="mb-5 border-b border-default pb-4">
          <UCheckbox v-model="filters.majorOnly" :label="t('seriesCatalog.majorOnly')" />
        </div>
        <h2 class="mb-3 text-xs font-medium text-muted">{{ t('seriesCatalog.types') }}</h2>
        <USelect v-model="category" :items="categoryOptions" :aria-label="t('seriesCatalog.types')" class="w-full lg:hidden" />
        <nav class="hidden flex-col gap-1 lg:flex" :aria-label="t('seriesCatalog.types')">
          <button
            v-for="option in categories"
            :key="option.value ?? 'all'"
            type="button"
            class="flex items-center justify-between gap-4 rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary"
            :class="filters.type === option.value ? 'bg-primary/10 font-medium text-primary' : 'text-muted hover:bg-elevated hover:text-default'"
            :aria-pressed="filters.type === option.value"
            @click="filters.type = option.value"
          >
            <span>{{ option.label }}</span>
            <span class="text-xs tabular-nums">{{ option.count }}</span>
          </button>
        </nav>
      </aside>

      <div class="min-w-0">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm" aria-live="polite">
          <p class="text-muted">
            <span class="font-medium text-default">{{ selectedType }}</span>
            <span class="ml-3">{{ t('seriesCatalog.total', { count: result.total }) }}</span>
          </p>
          <UButton v-if="hasFilters" variant="link" size="xs" :label="t('seriesCatalog.clear')" @click="clearFilters" />
        </div>

        <div v-if="filters.parentId" class="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
          <UIcon name="lucide:corner-down-right" class="size-4 shrink-0" aria-hidden="true" />
          <span>{{ t('seriesCatalog.childrenOf', { name: selectedParent?.name ?? filters.parentId }) }}</span>
          <UButton icon="lucide:x" variant="ghost" size="xs" :aria-label="t('seriesCatalog.removeParent')" @click="filters.parentId = null" />
        </div>

        <div v-if="loading" class="flex items-center justify-center gap-3 py-20 text-muted" role="status">
          <UIcon name="lucide:loader-circle" class="size-6 animate-spin" aria-hidden="true" />
          {{ t('seriesCatalog.loading') }}
        </div>
        <div v-else-if="error" class="rounded-lg border border-default py-14 text-center" role="alert">
          <p class="mb-4 text-sm text-muted">{{ t('seriesCatalog.loadFailed') }}</p>
          <UButton :label="t('seriesCatalog.retry')" variant="soft" @click="emit('retry')" />
        </div>
        <template v-else>
          <div class="overflow-hidden rounded-lg border border-default">
            <div class="hidden grid-cols-[2rem_minmax(0,1fr)_4rem_6rem_6rem_1rem] items-center gap-3 border-b border-default bg-muted px-4 py-3 text-xs text-muted md:grid" aria-hidden="true">
              <span />
              <span>{{ t('seriesCatalog.name') }}</span>
              <span>{{ t('seriesCatalog.code') }}</span>
              <span>{{ t('seriesCatalog.type') }}</span>
              <span>{{ t('seriesCatalog.releaseDate') }}</span>
              <span />
            </div>

            <div v-if="result.total === 0" class="px-4 py-16 text-center">
              <UIcon name="lucide:search-x" class="mb-3 size-7 text-dimmed" aria-hidden="true" />
              <p class="text-sm text-muted">{{ t('seriesCatalog.empty') }}</p>
              <UButton v-if="hasFilters" :label="t('seriesCatalog.clear')" variant="link" class="mt-3" @click="clearFilters" />
            </div>

            <article
              v-for="row in result.rows"
              :key="row.id"
              class="relative border-b border-default last:border-b-0 hover:bg-elevated/40"
              :class="row.isMajor ? 'border-l-3 border-l-primary' : 'border-l-3 border-l-transparent'"
            >
              <NuxtLink
                :to="row.to"
                class="grid grid-cols-[2rem_minmax(0,1fr)_auto_1rem] items-center gap-3 px-3 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:grid-cols-[2rem_minmax(0,1fr)_4rem_6rem_6rem_1rem]"
              >
                <SeriesIcon :src="row.icon" :fallback-src="row.fallbackIcon" />
                <span class="min-w-0">
                  <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span class="text-sm font-medium wrap-anywhere">{{ row.name }}</span>
                    <span v-if="row.isMajor" class="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{{ t('seriesCatalog.major') }}</span>
                  </span>
                  <span v-if="row.secondaryName" class="mt-1 block text-xs text-muted wrap-anywhere">{{ row.secondaryName }}</span>
                  <span class="mt-1 block text-xs text-muted md:hidden">{{ typeName(row.type) }} · {{ row.releaseDate ?? t('seriesCatalog.undated') }}</span>
                </span>
                <span class="font-mono text-xs text-muted">{{ row.id.toUpperCase() }}</span>
                <span class="hidden text-xs text-muted md:block">{{ typeName(row.type) }}</span>
                <span class="hidden text-xs text-muted tabular-nums md:block">{{ row.releaseDate ?? '—' }}</span>
                <UIcon name="lucide:chevron-right" class="size-4 text-dimmed" aria-hidden="true" />
              </NuxtLink>

              <div v-if="row.parentId || childCounts.get(row.id)" class="-mt-1 mb-3 ml-14 flex flex-wrap items-center gap-x-4 gap-y-2 pr-4 text-xs">
                <span v-if="row.parentId" class="inline-flex min-w-0 items-start gap-1 text-muted">
                  <UIcon name="lucide:corner-up-left" class="size-3.5 shrink-0" aria-hidden="true" />
                  <span>{{ t('seriesCatalog.parent') }}</span>
                  <NuxtLink :to="byId.get(row.parentId)?.to ?? parentLink(row.parentId)" class="text-primary hover:underline wrap-anywhere">
                    {{ byId.get(row.parentId)?.name ?? row.parentId.toUpperCase() }}
                  </NuxtLink>
                </span>
                <button v-if="childCounts.get(row.id)" type="button" class="inline-flex items-center gap-1 text-primary hover:underline" @click="showChildren(row.id)">
                  <UIcon name="lucide:git-branch" class="size-3.5" aria-hidden="true" />
                  {{ t('seriesCatalog.children', { count: childCounts.get(row.id) }) }}
                </button>
              </div>
            </article>
          </div>

          <footer class="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div class="flex flex-wrap items-center gap-3 text-xs text-muted">
              <span>{{ t('seriesCatalog.range', { start: result.total === 0 ? 0 : (result.page - 1) * pageSize + 1, end: Math.min(result.page * pageSize, result.total), total: result.total }) }}</span>
              <USelect v-model="pageSize" :items="pageSizes" size="xs" :aria-label="t('seriesCatalog.pageSize')" />
            </div>
            <UPagination v-if="result.total > pageSize" v-model:page="page" :total="result.total" :items-per-page="pageSize" :sibling-count="1" size="xs" :show-edges="false" />
          </footer>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { querySeries, type SeriesEntry, type SeriesFilters } from '../utils/series-catalog';

const props = withDefaults(defineProps<{
  entries:          SeriesEntry[];
  types:            { value: string, label: string }[];
  loading?:         boolean;
  error?:           boolean;
  showMajorFilter?: boolean;
  detailBase?:      string;
}>(), { loading: false, error: false, showMajorFilter: false, detailBase: '/set' });

const emit = defineEmits<{ retry: [] }>();
const { t, locale, localeProperties } = useI18n();
const filters = reactive<SeriesFilters>({ query: '', type: null, year: null, majorOnly: false, parentId: null, sort: 'newest' });
const page = ref(1);
const pageSize = ref(25);

const year = computed({
  get: () => filters.year ?? 'all',
  set: (value: string) => { filters.year = value === 'all' ? null : value; },
});
const category = computed({
  get: () => filters.type ?? 'all',
  set: (value: string) => { filters.type = value === 'all' ? null : value; },
});

const result = computed(() => querySeries(props.entries, filters, page.value, pageSize.value, localeProperties.value.language ?? locale.value));
const byId = computed(() => new Map<string, SeriesEntry>(props.entries.map((row: SeriesEntry) => [row.id, row])));
const selectedParent = computed(() => filters.parentId == null ? null : byId.value.get(filters.parentId));
const hasFilters = computed(() => Boolean(filters.query || filters.type || filters.year || filters.majorOnly || filters.parentId));
const selectedType = computed(() => filters.type == null ? t('seriesCatalog.all') : typeName(filters.type));
const categories = computed(() => [
  { value: null, label: t('seriesCatalog.all'), count: result.value.categoryTotal },
  ...props.types.map((type: { value: string, label: string }) => ({ ...type, count: result.value.typeCounts[type.value] ?? 0 })),
]);
const categoryOptions = computed(() => categories.value.map(option => ({
  value: option.value ?? 'all',
  label: `${option.label} (${option.count})`,
})));

const childCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const row of props.entries) {
    if (row.parentId) counts.set(row.parentId, (counts.get(row.parentId) ?? 0) + 1);
  }
  return counts;
});

const years = computed(() => {
  const dates = [...new Set<string>(props.entries.flatMap((row: SeriesEntry) => row.releaseDate == null ? [] : [row.releaseDate.slice(0, 4)]))].sort().reverse();
  const options = [{ value: 'all', label: t('seriesCatalog.allYears') }, ...dates.map(value => ({ value, label: value }))];
  if (props.entries.some((row: SeriesEntry) => row.releaseDate == null)) options.push({ value: 'undated', label: t('seriesCatalog.undated') });
  return options;
});

const sorts = computed(() => [
  { value: 'newest', label: t('seriesCatalog.newest') },
  { value: 'oldest', label: t('seriesCatalog.oldest') },
  { value: 'name', label: t('seriesCatalog.byName') },
]);
const pageSizes = computed(() => [25, 50, 100].map(value => ({ value, label: t('seriesCatalog.perPage', { count: value }) })));

watch([() => ({ ...filters }), pageSize], () => {
  page.value = 1;
});
watch(() => result.value.page, value => {
  page.value = value;
});

/** Resolves a game-provided category label without exposing internal category identifiers. */
function typeName(type: string): string {
  return props.types.find((option: { value: string, label: string }) => option.value === type)?.label ?? t('seriesCatalog.other');
}

/** Links an orphaned relation without requiring its parent in the loaded catalog. */
function parentLink(id: string): string {
  return `${props.detailBase}/${encodeURIComponent(id)}`;
}

/** Removes all restrictions while retaining the selected sort order. */
function clearFilters() {
  Object.assign(filters, { query: '', type: null, year: null, majorOnly: false, parentId: null });
}

/** Shows every direct child, including releases outside the previous filters. */
function showChildren(id: string) {
  clearFilters();
  filters.parentId = id;
}
</script>
