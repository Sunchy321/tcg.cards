<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <div class="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6">
      <!-- Back link -->
      <NuxtLink :to="{ path: `/document/${slugBase}`, query: { locale: currentLocale, version: toVersionTag } }" class="mb-4 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 dark:text-white/50 dark:hover:text-white/80">
        <UIcon name="lucide:arrow-left" class="size-4" />
        {{ $t('magic.document.back_to_document') }}
      </NuxtLink>

      <!-- Version selectors -->
      <div class="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div class="flex flex-wrap items-end gap-4">
          <div class="min-w-40 flex-1">
            <label class="mb-1 block text-sm font-medium text-neutral-600 dark:text-white/60">
              {{ $t('magic.document.diff.from_version') }}
            </label>
            <USelect
              :model-value="fromVersionTag"
              :items="versionItems"
              size="sm"
              class="w-full"
              @update:model-value="v => setFrom(v as string)"
            />
          </div>
          <div class="flex items-center pb-1">
            <UIcon name="lucide:arrow-right" class="size-5 text-neutral-400 dark:text-white/40" />
          </div>
          <div class="min-w-40 flex-1">
            <label class="mb-1 block text-sm font-medium text-neutral-600 dark:text-white/60">
              {{ $t('magic.document.diff.to_version') }}
            </label>
            <USelect
              :model-value="toVersionTag"
              :items="versionItems"
              size="sm"
              class="w-full"
              @update:model-value="v => setTo(v as string)"
            />
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex justify-center py-16">
        <UIcon name="lucide:loader" class="size-10 animate-spin text-neutral-400 dark:text-white/40" />
      </div>

      <!-- Error -->
      <div
        v-else-if="errorMessage"
        class="mt-6 rounded-2xl border border-rose-300 bg-rose-50/80 px-5 py-8 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
      >
        {{ errorMessage }}
      </div>

      <!-- Result -->
      <template v-else-if="diffData">
        <!-- Stats -->
        <div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="stat in statCards"
            :key="stat.label"
            class="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5"
          >
            <div class="flex items-center gap-3">
              <div :class="['flex size-8 items-center justify-center rounded-lg', stat.bg]">
                <UIcon :name="stat.icon" :class="['size-4', stat.color]" />
              </div>
              <div>
                <p class="text-xs text-neutral-500 dark:text-white/50">{{ stat.label }}</p>
                <p class="text-lg font-semibold">{{ stat.count }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Filter -->
        <div class="mt-6 flex items-center gap-3">
          <USelect
            :model-value="typeFilter"
            :items="typeFilterItems"
            size="sm"
            class="w-44"
            @update:model-value="v => typeFilter = v as string"
          />
          <div class="flex-1" />
          <span class="text-sm text-neutral-500 dark:text-white/50">
            {{ $t('magic.document.diff.total_changes', { count: filteredChangeCount }) }}
          </span>
        </div>

        <!-- Column headers -->
        <div class="mt-4 grid grid-cols-2 gap-4">
          <div class="rounded-lg bg-red-50/60 px-4 py-2 text-center text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {{ diffData.fromVersion.versionTag }}
          </div>
          <div class="rounded-lg bg-green-50/60 px-4 py-2 text-center text-sm font-medium text-green-700 dark:bg-green-500/10 dark:text-green-300">
            {{ diffData.toVersion.versionTag }}
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="filteredChangeCount === 0" class="py-16 text-center text-neutral-500 dark:text-white/50">
          <UIcon name="lucide:check-circle" class="mx-auto mb-3 size-10 opacity-40" />
          <p>{{ $t('magic.document.diff.no_changes') }}</p>
        </div>

        <!-- Diff rows -->
        <div v-if="filteredChangeCount > 0" class="mt-2 space-y-0">
          <template v-for="(row, idx) in filteredRows" :key="idx">
            <!-- Omitted marker -->
            <div
              v-if="row.kind === 'omitted'"
              class="flex items-center gap-3 py-2"
            >
              <div class="h-px flex-1 bg-neutral-200 dark:bg-white/10" />
              <span class="shrink-0 text-xs text-neutral-400 dark:text-white/35">
                {{ $t('magic.document.diff.omitted', { count: row.count }) }}
              </span>
              <div class="h-px flex-1 bg-neutral-200 dark:bg-white/10" />
            </div>

            <!-- Change row -->
            <div
              v-else
              :class="['grid grid-cols-2 gap-4 rounded-lg py-1', changeRowBg(row.type)]"
            >
              <p v-if="row.translationOnly" class="col-span-2 px-3 text-xs text-muted">{{ $t('magic.document.diff.translation_only') }}</p>
              <!-- From (left) -->
              <div class="min-w-0 px-3 py-1">
                <DocumentDiffSide
                  :sections="row.fromNodes ?? (row.from ? [row.from] : [])"
                  :text-diff="row.textDiff"
                  side="from"
                />
              </div>

              <!-- To (right) -->
              <div class="min-w-0 px-3 py-1">
                <DocumentDiffSide
                  :sections="row.toNodes ?? (row.to ? [row.to] : [])"
                  :text-diff="row.textDiff"
                  side="to"
                />
              </div>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  DocumentDiffPage,
  DocumentDiffRow,
} from '#model/magic/schema/document-page';

definePageMeta({
  layout:   'main',
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
    { label: i18n.t('magic.document.diff.type.modified'), count: s.modified + s.renamedModified, icon: 'lucide:pencil', bg: 'bg-blue-500/10', color: 'text-blue-500' },
    { label: i18n.t('magic.document.diff.other'), count: s.moved + s.renamed + s.split + s.merged, icon: 'lucide:move', bg: 'bg-amber-500/10', color: 'text-amber-500' },
  ];
});

// Filter
const typeFilter = ref('all');
const typeFilterItems = computed(() => [
  { label: i18n.t('magic.document.diff.filter_all'), value: 'all' },
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
    } else if (row.type === typeFilter.value) {
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

// Row background color
/** Color each existing change category consistently across both sides. */
function changeRowBg(type: string): string {
  switch (type) {
  case 'added':
    return 'bg-green-50/60 dark:bg-green-500/5';
  case 'removed':
    return 'bg-red-50/60 dark:bg-red-500/5';
  case 'modified':
  case 'renamed_modified':
    return 'bg-blue-50/60 dark:bg-blue-500/5';
  case 'moved':
  case 'renamed':
    return 'bg-amber-50/60 dark:bg-amber-500/5';
  default:
    return 'bg-neutral-50/60 dark:bg-white/[0.02]';
  }
}

useTitle(() => i18n.t('magic.document.diff.$self'));
</script>

<style lang="scss">
.diff-title {
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.15;
  color: rgb(23 23 23);
  text-wrap: balance;
}

.dark .diff-title {
  color: rgb(255 255 255 / 0.96);
}

.diff-title-main {
  font-size: 1.5rem;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.diff-title-section {
  font-size: 1.2rem;
  font-weight: 620;
  letter-spacing: -0.02em;
}

.diff-title-subsection {
  font-size: 1.05rem;
  font-weight: 620;
}

.diff-title-inline {
  font-size: 0.95rem;
  font-weight: 600;
}

.diff-serial {
  margin-right: 0.45rem;
  font-size: 0.88em;
  font-weight: 600;
  color: rgb(115 115 115);
}

.dark .diff-serial {
  color: rgb(255 255 255 / 0.45);
}

.diff-node-id {
  display: inline-block;
  margin-right: 0.45rem;
  padding: 0.05rem 0.35rem;
  border: 1px solid rgb(212 212 212 / 0.85);
  border-radius: 0.25rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78em;
  font-weight: 500;
  color: rgb(115 115 115);
  vertical-align: baseline;
}

.dark .diff-node-id {
  border-color: rgb(255 255 255 / 0.14);
  color: rgb(255 255 255 / 0.45);
}

.diff-content {
  color: rgb(64 64 64);
}

.dark .diff-content {
  color: rgb(255 255 255 / 0.76);
}

.diff-content :deep(p),
.diff-content p {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.8;
  white-space: pre-line;
}

.diff-content p + p {
  margin-top: 0.35rem;
}

.diff-content-example {
  font-size: 0.92rem;
}

.diff-content-implicit-heading {
  font-size: 1rem;
}

.diff-example-label {
  display: inline-flex;
  align-items: center;
  margin-bottom: 0.3rem;
  padding: 0.1rem 0.4rem;
  border: 1px solid rgb(212 212 212 / 0.85);
  border-radius: 9999px;
  color: rgb(82 82 82);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dark .diff-example-label {
  border-color: rgb(255 255 255 / 0.14);
  color: rgb(255 255 255 / 0.58);
}
</style>
