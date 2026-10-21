<template>
  <div class="min-h-dvh bg-default font-sans text-default">
    <div class="sticky top-0 z-50 bg-linear-to-br from-(--color-theme-from) via-(--color-theme-via) to-(--color-theme-to) max-sm:[&_header_[data-slot=center]]:min-w-0 max-sm:[&_header_[data-slot=center]>span]:truncate">
      <AppHeader />
    </div>

    <main class="mx-auto w-[calc(100%-2rem)] max-w-300 pb-32 pt-6 sm:w-[calc(100%-6rem)]">
      <div class="mb-6 flex items-center gap-4 text-xs text-muted">
        <NuxtLink :to="{ path: `/document/${slugBase}`, query: { locale: currentLocale, version: toVersionTag } }" class="inline-flex items-center gap-2 hover:text-default">
          <UIcon name="lucide:arrow-left" class="size-3.5" />
          {{ $t('magic.document.back_to_document') }}
        </NuxtLink>
        <span class="border-l border-default pl-4">{{ $t('magic.document.diff.$self') }}</span>
      </div>

      <div class="rounded-xl border border-default bg-default p-4 sm:px-5 sm:py-4">
        <div class="flex flex-wrap items-end gap-3 sm:gap-5">
          <div class="min-w-24 flex-1">
            <label for="compare-from" class="mb-2 block text-xs text-muted">{{ $t('magic.document.diff.from_version') }}</label>
            <USelect
              id="compare-from"
              :model-value="fromVersionTag"
              :items="versionItems"
              size="md"
              class="w-full"
              @update:model-value="v => setFrom(v as string)"
            />
          </div>
          <UIcon name="lucide:arrow-right" class="mb-2.5 size-4 shrink-0 text-muted" />
          <div class="min-w-24 flex-1">
            <label for="compare-to" class="mb-2 block text-xs text-muted">{{ $t('magic.document.diff.to_version') }}</label>
            <USelect
              id="compare-to"
              :model-value="toVersionTag"
              :items="versionItems"
              size="md"
              class="w-full"
              @update:model-value="v => setTo(v as string)"
            />
          </div>
          <div class="flex w-full justify-end gap-1 sm:w-auto" role="group" :aria-label="$t('magic.document.language')">
            <button
              v-for="language in ['zhs', 'en']"
              :key="language"
              type="button"
              class="rounded-md border px-3 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="currentLocale === language ? 'border-primary/30 bg-primary/10 text-primary' : 'border-transparent text-muted hover:border-default hover:text-default'"
              :aria-pressed="currentLocale === language"
              @click="setLocale(language)"
            >{{ language === 'zhs' ? '中文' : 'English' }}</button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="flex justify-center py-16" role="status">
        <UIcon name="lucide:loader" class="size-5 animate-spin text-muted motion-reduce:animate-none" :aria-label="$t('magic.document.loading')" />
      </div>
      <div v-else-if="errorMessage" class="mt-6 rounded-xl border border-error/30 bg-error/5 px-5 py-8 text-sm text-error" role="alert">
        {{ errorMessage }}
      </div>

      <template v-else-if="diffData">
        <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div v-for="stat in statCards" :key="stat.label" class="flex items-center gap-3 rounded-lg border border-default bg-default px-4 py-3 last:col-span-2 lg:last:col-span-1">
            <span :class="['flex size-7 items-center justify-center rounded-md', stat.bg]">
              <UIcon :name="stat.icon" :class="['size-3.5', stat.color]" />
            </span>
            <span class="text-xs text-muted">{{ stat.label }}</span>
            <span class="ml-auto text-xl font-medium text-highlighted tabular-nums">{{ stat.count }}</span>
          </div>
        </div>

        <div class="flex items-center gap-3 py-4">
          <USelect
            :model-value="typeFilter"
            :items="typeFilterItems"
            :aria-label="$t('magic.document.diff.filter_all')"
            size="sm"
            class="w-36"
            @update:model-value="v => typeFilter = v as string"
          />
          <span class="ml-auto text-xs text-muted">{{ $t('magic.document.diff.total_changes', { count: filteredChangeCount }) }}</span>
        </div>

        <div class="sticky top-(--ui-header-height) z-10 grid grid-cols-2 divide-x divide-default rounded-t-xl border border-default bg-muted">
          <div class="flex min-w-0 items-center gap-2 px-3 py-4 sm:gap-3 sm:px-6">
            <span class="size-1.5 shrink-0 rounded-full bg-red-400/70" aria-hidden="true" />
            <span class="text-xs tabular-nums sm:text-sm">{{ diffData.fromVersion.versionTag }}</span>
            <span class="ml-auto text-[0.65rem] text-muted">{{ $t('magic.document.diff.from_version') }}</span>
          </div>
          <div class="flex min-w-0 items-center gap-2 px-3 py-4 sm:gap-3 sm:px-6">
            <span class="size-1.5 shrink-0 rounded-full bg-green-500/60" aria-hidden="true" />
            <span class="text-xs tabular-nums sm:text-sm">{{ diffData.toVersion.versionTag }}</span>
            <span class="ml-auto text-[0.65rem] text-muted">{{ $t('magic.document.diff.to_version') }}</span>
          </div>
        </div>

        <div class="overflow-hidden rounded-b-xl border border-t-0 border-default">
          <div v-if="filteredChangeCount === 0" class="py-16 text-center text-sm text-muted">
            <UIcon name="lucide:check-circle" class="mx-auto mb-3 size-7 opacity-40" />
            <p>{{ $t('magic.document.diff.no_changes') }}</p>
          </div>
          <template v-else>
            <template v-for="(row, idx) in filteredRows" :key="idx">
              <div v-if="row.kind === 'omitted'" class="flex items-center gap-3 border-b border-default px-3 py-5 text-[0.65rem] text-muted last:border-b-0 sm:px-6">
                <span class="h-px flex-1 bg-border" />
                <span>{{ $t('magic.document.diff.omitted', { count: row.count }) }}</span>
                <span class="h-px flex-1 bg-border" />
              </div>
              <section v-else class="border-b border-default last:border-b-0">
                <div v-if="row.referenceOnly || !['added', 'removed', 'modified'].includes(row.type)" class="flex flex-wrap items-center gap-2 px-3 pt-3 sm:px-6">
                  <span v-if="row.referenceOnly" class="inline-block rounded border border-primary/20 bg-primary/5 px-2 py-0.5 text-[0.65rem] text-primary">{{ $t('magic.document.diff.reference_only') }}</span>
                  <span
                    v-if="!['added', 'removed', 'modified'].includes(row.type)"
                    class="inline-block rounded border border-default bg-muted px-2 py-0.5 text-[0.65rem] text-muted"
                  >
                    {{ changeLabel(row) }}
                    <span v-if="['renamed', 'renamed_modified', 'moved'].includes(row.type) && row.from?.serial && row.to?.serial" class="ml-1 tabular-nums">{{ row.from.serial.replace(/\.$/, '') }} → {{ row.to.serial.replace(/\.$/, '') }}</span>
                  </span>
                </div>
                <div class="grid grid-cols-2 divide-x divide-default">
                  <div class="min-w-0 px-3 py-4 sm:px-6 sm:py-5">
                    <DocumentDiffSide :sections="row.fromNodes ?? (row.from ? [row.from] : [])" :text-diff="row.textDiff" :highlight-number="['renamed', 'renamed_modified', 'moved'].includes(row.type)" side="from" />
                  </div>
                  <div class="min-w-0 px-3 py-4 sm:px-6 sm:py-5">
                    <DocumentDiffSide :sections="row.toNodes ?? (row.to ? [row.to] : [])" :text-diff="row.textDiff" :highlight-number="['renamed', 'renamed_modified', 'moved'].includes(row.type)" side="to" />
                  </div>
                </div>
              </section>
            </template>
          </template>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import type {
  DocumentDiffPage,
  DocumentDiffRow,
} from '#model/magic/schema/document-page';

definePageMeta({
  layout:   false,
  game:     'magic',
  // Match the reader's single public CR address.
  validate: route => !('slug' in route.params && route.params.slug === 'magic-cr'),
});

const { $orpc } = useNuxtApp();
const i18n = useI18n();
const route = useRoute('document-slug');
const router = useRouter();

const slugBase = computed(() => String(route.params.slug ?? 'cr'));
const apiSlug = computed(() => slugBase.value === 'cr' ? 'magic-cr' : slugBase.value);

const currentLocale = computed(() => {
  // Explicit reading choices survive shared links; otherwise follow the interface,
  // independently of the game's card/data locale setting.
  const selected = route.query.locale;
  return selected === 'en' || selected === 'zhs' ? selected : i18n.locale.value === 'zhs' ? 'zhs' : 'en';
});
const versionItems = ref<Array<{ label: string, value: string }>>([]);
const fromVersionTag = ref('');
const toVersionTag = ref('');
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const diffData = shallowRef<DocumentDiffPage | null>(null);
let requestToken = 0;

/** Resolve dates from the address and ignore responses for an older navigation. */
async function loadComparison() {
  const token = ++requestToken;
  loading.value = true;
  errorMessage.value = null;
  diffData.value = null;
  try {
    const slug = apiSlug.value;
    const locale = currentLocale.value;
    const summary = await $orpc.magic.document.summary({ slug, locale });
    if (token !== requestToken) return;
    versionItems.value = summary.versions.map(version => ({ label: `${version.versionTag} · ${version.effectiveDate}`, value: version.versionTag }));
    const from = typeof route.query.from === 'string' ? route.query.from : undefined;
    const to = typeof route.query.to === 'string' ? route.query.to : undefined;
    fromVersionTag.value = summary.versions.find(version => version.versionTag === from)?.versionTag ?? summary.versions[1]?.versionTag ?? summary.versions[0]?.versionTag ?? '';
    toVersionTag.value = summary.versions.find(version => version.versionTag === to)?.versionTag ?? summary.versions[0]?.versionTag ?? '';
    if (!fromVersionTag.value || !toVersionTag.value) return;
    const result = await $orpc.magic.document.compare({ slug, fromVersionTag: fromVersionTag.value, toVersionTag: toVersionTag.value, locale });
    if (token === requestToken) diffData.value = result;
  } catch {
    if (token === requestToken) errorMessage.value = i18n.t('magic.document.diff.load_failed');
  } finally {
    if (token === requestToken) loading.value = false;
  }
}

/** Preserve reading language and the other date while selecting an edition. */
function setFrom(value: string) {
  void router.replace({ query: { ...route.query, from: value, locale: currentLocale.value } });
}

/** Preserve reading language and the other date while selecting an edition. */
function setTo(value: string) {
  void router.replace({ query: { ...route.query, to: value, locale: currentLocale.value } });
}

/** Switch reading language while retaining both selected editions. */
function setLocale(locale: string) {
  void router.replace({ query: { ...route.query, from: fromVersionTag.value, to: toVersionTag.value, locale } });
}

watch([apiSlug, currentLocale, () => route.query.from, () => route.query.to], () => {
  void loadComparison();
}, { immediate: true });

onBeforeUnmount(() => {
  requestToken += 1;
});

// Stats
const statCards = computed(() => {
  if (!diffData.value) return [];
  const s = diffData.value.stats;
  return [
    { label: i18n.t('magic.document.diff.type.added'), count: s.added, icon: 'lucide:plus', bg: 'bg-green-500/10', color: 'text-green-500' },
    { label: i18n.t('magic.document.diff.type.removed'), count: s.removed, icon: 'lucide:minus', bg: 'bg-red-500/10', color: 'text-red-500' },
    { label: i18n.t('magic.document.diff.type.modified'), count: s.modified + s.renamedModified, icon: 'lucide:pencil', bg: 'bg-primary/10', color: 'text-primary' },
    { label: i18n.t('magic.document.diff.reference_updates'), count: s.referenceUpdated, icon: 'lucide:link', bg: 'bg-primary/5', color: 'text-primary' },
    { label: i18n.t('magic.document.diff.other'), count: s.moved + s.renamed + s.split + s.merged, icon: 'lucide:move', bg: 'bg-muted', color: 'text-muted' },
  ];
});

// Filter
const typeFilter = ref('all');
const typeFilterItems = computed(() => [
  { label: i18n.t('magic.document.diff.filter_all'), value: 'all' },
  { label: i18n.t('magic.document.diff.reference_only'), value: 'reference_only' },
  { label: i18n.t('magic.document.diff.hide_reference_updates'), value: 'exclude_reference' },
  { label: i18n.t('magic.document.diff.type.added'), value: 'added' },
  { label: i18n.t('magic.document.diff.type.removed'), value: 'removed' },
  { label: i18n.t('magic.document.diff.type.modified'), value: 'modified' },
  { label: i18n.t('magic.document.diff.type.moved'), value: 'moved' },
  { label: i18n.t('magic.document.diff.type.renamed'), value: 'renamed' },
  { label: i18n.t('magic.document.diff.type.renamed_modified'), value: 'renamed_modified' },
  { label: i18n.t('magic.document.diff.type.split'), value: 'split' },
  { label: i18n.t('magic.document.diff.type.merged'), value: 'merged' },
]);

const filteredRows = computed((): DocumentDiffRow[] => {
  if (!diffData.value) return [];

  const raw = diffData.value.rows;

  if (typeFilter.value === 'all') return raw;

  const result: DocumentDiffRow[] = [];
  let omitted = 0;

  for (const row of raw) {
    if (row.kind === 'omitted') {
      omitted += row.count;
    } else if (typeFilter.value === 'reference_only'
      ? row.referenceOnly
      : typeFilter.value === 'exclude_reference'
        ? !row.referenceOnly
        : row.type === typeFilter.value && !(typeFilter.value === 'modified' && row.referenceOnly)) {
      if (omitted > 0) {
        result.push({ kind: 'omitted', count: omitted });
        omitted = 0;
      }

      result.push(row);
    } else {
      omitted++;
    }
  }

  if (omitted > 0) {
    result.push({ kind: 'omitted', count: omitted });
  }

  return result;
});

const filteredChangeCount = computed(() =>
  filteredRows.value.filter(r => r.kind === 'change').length,
);

/** Describe structural movement alongside any visible wording changes. */
function changeLabel(row: Extract<DocumentDiffRow, { kind: 'change' }>): string {
  const type = row.referenceOnly && row.type === 'renamed_modified'
    ? 'renamed'
    : row.type === 'moved' && row.textDiff != null && !row.referenceOnly ? 'moved_modified' : row.type;
  return i18n.t(`magic.document.diff.type.${type}`);
}

useTitle(() => i18n.t('magic.document.diff.$self'));
</script>
