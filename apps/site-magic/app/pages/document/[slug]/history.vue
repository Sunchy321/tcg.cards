<template>
  <div class="document-history min-h-dvh font-sans text-default">
    <div class="sticky top-0 z-50 bg-linear-to-br from-(--color-theme-from) via-(--color-theme-via) to-(--color-theme-to) max-sm:[&_header_[data-slot=center]]:min-w-0 max-sm:[&_header_[data-slot=center]>span]:truncate">
      <AppHeader />
    </div>

    <main class="mx-auto w-[calc(100%-3rem)] max-w-240 pb-32 pt-12 transition-opacity motion-reduce:transition-none sm:w-[calc(100%-6rem)] sm:pt-20" :class="{ 'opacity-60': refreshing }">
      <div v-if="pending" class="flex justify-center py-16" role="status">
        <UIcon name="lucide:loader" class="size-5 animate-spin text-stone-400 motion-reduce:animate-none" :aria-label="$t('magic.document.loading')" />
      </div>
      <div v-else-if="failed" role="alert" class="space-y-4 py-8 text-sm">
        <p>{{ $t('magic.document.history.not_found') }}</p>
        <UButton color="neutral" variant="ghost" @click="load">{{ $t('magic.document.retry') }}</UButton>
      </div>

      <template v-else-if="data">
        <h2 class="sr-only">{{ $t('magic.document.history.$self') }}</h2>
        <p class="text-sm leading-loose text-(--reader-muted) [&_a]:text-(--reader-accent)">
          <span v-if="data.entry.serial" class="mr-3 font-mono tracking-tight">{{ data.entry.serial }}</span>
          <DocumentText :text="data.entry.excerpt" :slug="slug" :version-tag="lastVersionTag" />
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-(--reader-muted)">
          <span>{{ fmt(data.entry.firstDate) }} — {{ data.entry.lastDate ? fmt(data.entry.lastDate) : $t('magic.document.history.latest') }}</span>
          <span>{{ $t('magic.document.history.lineage', { count: data.entry.lineageCount }) }}</span>
          <span>{{ $t('magic.document.history.period', { count: data.entry.periodCount }) }}</span>
          <div class="ml-auto flex gap-2" role="group" :aria-label="$t('magic.document.language')">
            <button
              v-for="language in ['zhs', 'en']"
              :key="language"
              type="button"
              class="rounded-md px-2.5 py-1 text-xs transition-colors"
              :class="currentLocale === language ? 'bg-primary/10 text-primary' : 'text-(--reader-muted) hover:bg-elevated hover:text-default'"
              :aria-pressed="currentLocale === language"
              @click="selectLocale(language)"
            >{{ language === 'zhs' ? '中文' : 'English' }}</button>
          </div>
        </div>

        <div class="mb-6 mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-(--reader-line) pt-5 text-xs text-(--reader-muted)" :aria-label="$t('magic.document.history.$self')">
          <span class="flex items-center gap-1.5"><i class="h-2 w-3.5 rounded-sm bg-green-100 dark:bg-green-500/30" />{{ $t('magic.document.history.legend.add') }}</span>
          <span class="flex items-center gap-1.5"><i class="h-2 w-3.5 rounded-sm bg-red-100 dark:bg-red-500/30" />{{ $t('magic.document.history.legend.remove') }}</span>
          <span class="flex items-center gap-1.5"><i class="h-2 w-3.5 rounded-sm bg-amber-100 dark:bg-amber-500/30" />{{ $t('magic.document.history.legend.both') }}</span>
        </div>

        <section :aria-label="$t('magic.document.history.$self')">
          <template v-for="(row, index) in data.rows" :key="index">
            <article v-if="row.kind === 'period'" class="border-t border-(--reader-line) py-6 first:border-t-0">
              <header class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--reader-muted)">
                <template v-for="cell in row.cells" :key="cell.itemId">
                  <span v-if="cell.serial" class="font-mono tracking-tight">{{ cell.serial }}</span>
                  <span v-if="cell.renamedFrom" class="tag">{{ $t('magic.document.history.renamed_from', { serial: cell.renamedFrom }) }}</span>
                  <span v-if="cell.state === 'added'" class="tag">{{ $t('magic.document.history.added') }}</span>
                  <span v-if="cell.isFallback" class="tag">{{ $t('magic.document.history.fallback') }}</span>
                </template>
                <span class="ml-auto flex items-center gap-1.5">
                  <NuxtLink :to="readerLink(row.versionFrom, row.cells[0])" class="font-mono tabular-nums hover:underline">{{ fmt(row.dateFrom) }}</NuxtLink>
                  <template v-if="row.dateTo">
                    <span>—</span>
                    <NuxtLink :to="readerLink(row.versionTo, row.cells[0])" class="font-mono tabular-nums hover:underline">{{ fmt(row.dateTo) }}</NuxtLink>
                  </template>
                  <span v-else>{{ $t('magic.document.history.latest') }}</span>
                </span>
              </header>
              <div
                v-for="cell in row.cells"
                :key="cell.itemId"
                class="entry relative py-0.5"
                :class="{ 'entry-focus': focused(cell) }"
              >
                <p class="m-0 wrap-anywhere text-base leading-loose sm:text-[1.0625rem]" :class="{ 'text-(--reader-muted)': !cell.changed }" :lang="cell.lang">
                  <span v-if="cell.serial" class="mr-3 font-mono text-sm tracking-tight text-(--reader-muted)">{{ cell.serial }}</span>
                  <template v-for="(span, spanIndex) in cell.diff ?? [{ type: 'common', value: cell.text }]" :key="spanIndex">
                    <mark v-if="span.type !== 'common'" :class="markClass(span.type)"><DocumentText :text="span.value" :slug="slug" :version-tag="row.versionTo" /></mark>
                    <DocumentText v-else :text="span.value" :slug="slug" :version-tag="row.versionTo" />
                  </template>
                </p>
              </div>
            </article>
            <div v-else class="transition" role="group" :aria-label="eventLabel(row.event)">
              <span class="transition-label">
                <span>{{ eventKind(row.event.kind) }}</span>
                <span class="font-mono tabular-nums">{{ fmt(row.event.date) }}</span>
              </span>
            </div>
          </template>
        </section>

        <div class="mt-6 border-t border-(--reader-line) pt-6 text-center text-xs text-(--reader-muted)">{{ $t('magic.document.history.end') }}</div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { DocumentItemHistoryCell, DocumentItemHistoryDiffSpan, DocumentItemHistoryEvent, DocumentItemHistoryPage } from '#model/magic/schema/document-page';

definePageMeta({
  layout:   false,
  game:     'magic',
  // Imported storage identifiers are not alternative public document addresses.
  validate: route => !('slug' in route.params && route.params.slug === 'magic-cr'),
});

const { $orpc } = useNuxtApp();
const i18n = useI18n();
const route = useRoute('document-slug');
const router = useRouter();

const slug = computed(() => String(route.params.slug ?? 'cr'));
const apiSlug = computed(() => slug.value === 'cr' ? 'magic-cr' : slug.value);
const itemId = computed(() => typeof route.query.id === 'string' ? route.query.id : undefined);
const currentLocale = computed(() => {
  // The same reading choice as the reader: an explicit language survives shared links.
  const selected = route.query.locale;
  return selected === 'en' || selected === 'zhs' ? selected : i18n.locale.value === 'zhs' ? 'zhs' : 'en';
});
const localeQuery = computed(() => ({ locale: currentLocale.value }));
const documentName = computed(() => slug.value === 'cr' ? i18n.t('magic.document.names.cr') : data.value?.document.name ?? slug.value);

const data = shallowRef<DocumentItemHistoryPage | null>(null);
const pending = ref(false);
const refreshing = ref(false);
const failed = ref(false);

const lastVersionTag = computed(() => {
  for (let index = data.value?.rows.length ?? 0; index >= 0; index -= 1) {
    const row = data.value?.rows[index];
    if (row?.kind === 'period') return row.versionTo;
  }
  return '';
});

function fmt(date: string) {
  return date.replaceAll('-', '.');
}

/** Switches the reading language like the reader does: an explicit choice in the shareable address. */
function selectLocale(language: string) {
  void router.push({ query: { ...route.query, locale: language } });
}

function markClass(type: DocumentItemHistoryDiffSpan['type']) {
  const map: Record<DocumentItemHistoryDiffSpan['type'], string> = {
    add:    'bg-green-100 dark:bg-green-500/30',
    remove: 'bg-red-100 dark:bg-red-500/30',
    dual:   'bg-amber-100 dark:bg-amber-500/30',
    common: '',
  };
  return map[type];
}

/** Highlights only the queried entry once the page carries several lineage members. */
function focused(cell: DocumentItemHistoryCell) {
  return data.value != null && data.value.entry.lineageCount > 1 && cell.itemId === data.value.entry.itemId;
}

function readerLink(versionTag: string, cell?: DocumentItemHistoryCell) {
  const anchor = cell?.serial?.replace(/\.$/, '');
  return {
    path:  `/document/${slug.value}`,
    query: { version: versionTag, ...localeQuery.value },
    hash:  anchor ? `#${encodeURIComponent(anchor)}` : undefined,
  };
}

function eventKind(kind: DocumentItemHistoryEvent['kind']) {
  return i18n.t(`magic.document.history.${kind}`);
}

function eventLabel(event: DocumentItemHistoryEvent) {
  return `${eventKind(event.kind)} ${fmt(event.date)}`;
}

let loadToken = 0;
async function load() {
  const token = ++loadToken;
  if (itemId.value == null) {
    data.value = null;
    failed.value = true;
    return;
  }
  // A re-read keeps the current timeline on screen and swaps it only when the fresh one arrives.
  if (data.value == null) pending.value = true;
  else refreshing.value = true;
  try {
    const page = await $orpc.magic.document.itemHistory({ slug: apiSlug.value, itemId: itemId.value, locale: currentLocale.value });
    if (token !== loadToken) return;
    data.value = page;
    failed.value = false;
  } catch {
    if (token !== loadToken) return;
    data.value = null;
    failed.value = true;
  } finally {
    if (token === loadToken) {
      pending.value = false;
      refreshing.value = false;
    }
  }
}

watch([apiSlug, itemId, currentLocale], load, { immediate: true });

useTitle(() => `${documentName.value} / ${i18n.t('magic.document.history.$self')}`);
</script>

<style scoped>
.document-history {
  --reader-bg: var(--ui-bg);
  --reader-muted: var(--ui-text-muted);
  --reader-line: var(--ui-border);
  --reader-accent: var(--ui-primary);
  background: var(--reader-bg);
}

.tag {
  color: var(--reader-muted);
  font-size: 0.6875rem;
  white-space: nowrap;
}

.entry-focus::before {
  content: '';
  position: absolute;
  left: -0.9rem;
  top: 0.35rem;
  bottom: 0.35rem;
  width: 3px;
  border-radius: 3px;
  background: var(--reader-accent);
}

.entry-focus {
  background: color-mix(in srgb, var(--reader-accent) 6%, transparent);
  border-radius: 3px;
}

mark {
  color: inherit;
  border-radius: 2px;
  padding: 2px 0;
  box-decoration-break: clone;
}

.transition {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--reader-muted);
  font-size: 0.6875rem;
  padding: 0.35rem 0;
}

.transition::before,
.transition::after {
  content: '';
  flex: 1;
  min-width: 0.875rem;
  border-top: 1px solid var(--reader-line);
}

.transition-label {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
}
</style>
