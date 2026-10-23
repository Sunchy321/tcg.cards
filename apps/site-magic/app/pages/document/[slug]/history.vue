<template>
  <div class="document-history min-h-dvh font-sans text-default">
    <div class="sticky top-0 z-50 bg-linear-to-br from-(--color-theme-from) via-(--color-theme-via) to-(--color-theme-to) max-sm:[&_header_[data-slot=center]]:min-w-0 max-sm:[&_header_[data-slot=center]>span]:truncate">
      <AppHeader />
    </div>

    <main class="mx-auto w-[calc(100%-5rem)] max-w-218 pb-32 pt-12 transition-opacity motion-reduce:transition-none sm:w-[calc(100%-6rem)] sm:pt-20" :class="{ 'opacity-60': refreshing }">
      <div v-if="pending" class="flex justify-center py-16" role="status">
        <UIcon name="lucide:loader" class="size-5 animate-spin text-stone-400 motion-reduce:animate-none" :aria-label="$t('magic.document.loading')" />
      </div>
      <div v-else-if="failed" role="alert" class="space-y-4 py-8 text-sm">
        <p>{{ $t('magic.document.history.not_found') }}</p>
        <UButton color="neutral" variant="ghost" @click="load">{{ $t('magic.document.retry') }}</UButton>
      </div>

      <template v-else-if="data">
        <nav class="mb-7 text-xs text-(--reader-muted)" :aria-label="$t('magic.document.history.$self')">
          <NuxtLink :to="{ path: `/document/${slug}`, query: localeQuery }" class="hover:underline">{{ documentName }}</NuxtLink>
          <span aria-hidden="true"> / </span>{{ $t('magic.document.history.$self') }}
        </nav>
        <h1 class="text-[1.6875rem] font-semibold leading-snug tracking-tight sm:text-3xl">
          {{ data.entry.serial ? $t('magic.document.history.title', { serial: data.entry.serial }) : $t('magic.document.history.$self') }}
        </h1>
        <p class="mt-3 text-sm leading-loose text-(--reader-muted) [&_a]:text-(--reader-accent)">
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
            <article v-if="row.kind === 'period'" class="border-t border-(--reader-line) py-6 first:border-t-0 [.transition+&]:border-t-0">
              <header class="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--reader-muted)">
                <NuxtLink :to="readerLink(row.versionFrom, row.cells[0])" class="font-mono tabular-nums text-(--reader-accent) hover:underline">{{ fmt(row.dateFrom) }}</NuxtLink>
                <span>—</span>
                <NuxtLink v-if="row.dateTo" :to="readerLink(row.versionTo, row.cells[0])" class="font-mono tabular-nums text-(--reader-accent) hover:underline">{{ fmt(row.dateTo) }}</NuxtLink>
                <span v-else>{{ $t('magic.document.history.latest') }}</span>
              </header>
              <div
                v-for="cell in row.cells"
                :key="cell.itemId"
                class="entry relative py-0.5 [&+.entry]:mt-[0.8rem]"
              >
                <div v-if="lineageMarks(cell, index).length" class="absolute right-[calc(100%+0.75rem)] top-[0.65rem] flex flex-col items-center gap-1">
                  <UTooltip v-for="mark in lineageMarks(cell, index)" :key="mark.kind" :text="mark.label" :delay-duration="0">
                    <span role="img" tabindex="0" :aria-label="mark.label" class="inline-flex size-4.5 items-center justify-center text-(--reader-muted) focus-visible:outline-2 focus-visible:outline-offset-2">
                      <UIcon :name="mark.icon" class="size-4.5" :class="{ 'rotate-180': mark.kind === 'split' || mark.kind === 'merged' }" aria-hidden="true" />
                    </span>
                  </UTooltip>
                </div>
                <span v-if="cell.isFallback" role="img" :aria-label="$t('magic.document.history.fallback')" class="pointer-events-none absolute bottom-1 right-0 inline-flex select-none items-center font-mono text-xs leading-none text-default/15">
                  <UIcon name="lucide:languages" class="size-3" aria-hidden="true" />
                </span>
                <p class="relative m-0 wrap-anywhere text-base leading-loose sm:text-[1.0625rem]" :class="{ 'text-(--reader-muted)': !cell.changed, 'pr-11': cell.isFallback }" :lang="cell.lang">
                  <NuxtLink v-if="cell.isSnapshot && cell.serial" :to="historyLink(cell.itemId)" class="mr-3 font-mono text-sm tracking-tight text-(--reader-accent) hover:underline">{{ cell.serial }}</NuxtLink>
                  <span v-else-if="cell.serial" class="mr-3 font-mono text-sm tracking-tight text-(--reader-muted)">{{ cell.serial }}</span>
                  <template v-for="(span, spanIndex) in textSpans(cell)" :key="spanIndex">
                    <mark v-if="span.type !== 'common'" :class="markClass(span.type)"><DocumentText :text="span.value" :slug="slug" :version-tag="row.versionTo" /></mark>
                    <DocumentText v-else :text="span.value" :slug="slug" :version-tag="row.versionTo" />
                  </template>
                </p>
              </div>
            </article>
            <article v-else-if="row.event.kind === 'removed'" class="border-t border-(--reader-line) py-6" :aria-label="eventLabel(row.event)">
              <header class="mb-3 text-xs text-(--reader-muted)">
                <span class="font-mono tabular-nums">{{ fmt(row.event.date) }}</span>
              </header>
              <div v-for="party in row.event.from" :key="party.itemId" class="relative min-h-9 py-0.5">
                <div class="absolute right-[calc(100%+0.75rem)] top-[0.65rem]">
                  <UTooltip :text="eventKind('removed')" :delay-duration="0">
                    <span role="img" tabindex="0" :aria-label="eventKind('removed')" class="inline-flex size-4.5 items-center justify-center text-(--reader-muted) focus-visible:outline-2 focus-visible:outline-offset-2">
                      <UIcon name="lucide:minus" class="size-4.5" aria-hidden="true" />
                    </span>
                  </UTooltip>
                </div>
              </div>
            </article>
            <div v-else class="transition" role="group" :aria-label="eventLabel(row.event)">
              <span class="transition-label">
                <span>{{ eventKind(row.event.kind) }}</span>
                <span class="flex flex-wrap items-baseline justify-center gap-x-1.5 gap-y-1 font-mono tabular-nums">
                  <template v-for="(party, partyIndex) in row.event.from" :key="party.itemId">
                    <span v-if="partyIndex" aria-hidden="true">＋</span>
                    <NuxtLink :to="historyLink(party.itemId)" class="text-(--reader-accent) hover:underline">{{ party.serial ?? $t('magic.document.history.$self') }}</NuxtLink>
                  </template>
                  <span aria-hidden="true">→</span>
                  <template v-for="(party, partyIndex) in row.event.to" :key="party.itemId">
                    <span v-if="partyIndex" aria-hidden="true">＋</span>
                    <NuxtLink :to="historyLink(party.itemId)" class="text-(--reader-accent) hover:underline">{{ party.serial ?? $t('magic.document.history.$self') }}</NuxtLink>
                  </template>
                </span>
                <NuxtLink v-if="row.event.versionFrom && row.event.versionTo" :to="{ path: `/document/${slug}/diff`, query: { from: row.event.versionFrom, to: row.event.versionTo, ...localeQuery } }" class="whitespace-nowrap text-(--reader-accent) hover:underline">{{ $t('magic.document.history.compare') }} ↗</NuxtLink>
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
const route = useRoute('document-slug-history');
const router = useRouter();

const slug = computed(() => String(route.params.slug ?? 'comprehensive-rules'));
const apiSlug = computed(() => slug.value === 'comprehensive-rules' ? 'magic-cr' : slug.value);
const itemId = computed(() => typeof route.query.id === 'string' ? route.query.id : undefined);
const entryVersion = computed(() => typeof route.query.version === 'string' ? route.query.version : undefined);
const currentLocale = computed(() => {
  // The same reading choice as the reader: an explicit language survives shared links.
  const selected = route.query.locale;
  return selected === 'en' || selected === 'zhs' ? selected : i18n.locale.value === 'zhs' ? 'zhs' : 'en';
});
const localeQuery = computed(() => ({ locale: currentLocale.value }));
const documentName = computed(() => slug.value === 'comprehensive-rules' ? i18n.t('magic.document.names.cr') : data.value?.document.name ?? slug.value);

const data = shallowRef<DocumentItemHistoryPage | null>(null);
const pending = ref(false);
const refreshing = ref(false);
const failed = ref(false);

const lastVersionTag = computed(() => {
  if (data.value?.entry.versionTag) return data.value.entry.versionTag;
  for (let index = data.value?.rows.length ?? 0; index >= 0; index -= 1) {
    const row = data.value?.rows[index];
    if (row?.kind === 'period') return row.versionTo;
  }
  return '';
});

/** Formats an effective date for the timeline. */
function fmt(date: string) {
  return date.replaceAll('-', '.');
}

/** Switches the reading language like the reader does: an explicit choice in the shareable address. */
function selectLocale(language: string) {
  void router.push({ query: { ...route.query, locale: language } });
}

/** Maps the two directional comparisons to the agreed highlight colours. */
function markClass(type: DocumentItemHistoryDiffSpan['type']) {
  const map: Record<DocumentItemHistoryDiffSpan['type'], string> = {
    add:    'bg-green-100 dark:bg-green-500/30',
    remove: 'bg-red-100 dark:bg-red-500/30',
    dual:   'bg-amber-100 dark:bg-amber-500/30',
    common: '',
  };
  return map[type];
}

/** Preserves a full plain-text row when no directional comparison is available. */
function textSpans(cell: DocumentItemHistoryCell): DocumentItemHistoryDiffSpan[] {
  return cell.diff ?? [{ type: 'common', value: cell.text }];
}

/** Opens the exact edition and official anchor of a period. */
function readerLink(versionTag: string, cell?: DocumentItemHistoryCell) {
  const anchor = cell?.nodeId ?? cell?.serial?.replace(/\.$/, '');
  return {
    path:  `/document/${slug.value}`,
    query: { version: versionTag, node: anchor, ...localeQuery.value },
    hash:  anchor ? `#${encodeURIComponent(anchor)}` : undefined,
  };
}

/** Localizes a structural event name. */
function eventKind(kind: DocumentItemHistoryEvent['kind']) {
  return i18n.t(`magic.document.history.${kind}`);
}

/** Describes the relation with official numbers rather than internal identities. */
function eventLabel(event: DocumentItemHistoryEvent) {
  return `${eventKind(event.kind)} ${event.from.map(party => party.serial).filter(Boolean).join(' + ')} → ${event.to.map(party => party.serial).filter(Boolean).join(' + ')} ${fmt(event.date)}`;
}

/** Opens another participant in the same reading language. */
function historyLink(id: string) {
  return { path: `/document/${slug.value}/history`, query: { id, ...localeQuery.value } };
}

/** Describes one event symbol in the outside gutter. */
interface HistoryMark {
  kind:  'split' | 'merged' | 'added' | 'renamed';
  icon:  string;
  label: string;
}

/** Keeps entry changes and structural roles in the same outside gutter. */
function lineageMarks(cell: DocumentItemHistoryCell, index: number): HistoryMark[] {
  const marks: HistoryMark[] = [];
  const previous = data.value?.rows[index - 1];
  const next = data.value?.rows[index + 1];

  if (previous?.kind === 'event' && previous.event.kind === 'split' && previous.event.to.some(party => party.itemId === cell.itemId)) {
    marks.push({ kind: 'split', icon: 'lucide:split', label: eventKind('split') });
  }

  if (next?.kind === 'event' && next.event.kind === 'merged' && next.event.from.some(party => party.itemId === cell.itemId)) {
    marks.push({ kind: 'merged', icon: 'lucide:merge', label: eventKind('merged') });
  }

  if (cell.state === 'added') {
    marks.push({ kind: 'added', icon: 'lucide:plus', label: i18n.t('magic.document.history.added') });
  }

  if (cell.renamedFrom) {
    marks.push({ kind: 'renamed', icon: 'lucide:hash', label: i18n.t('magic.document.history.renamed_from', { serial: cell.renamedFrom }) });
  }

  return marks;
}

let loadToken = 0;
/** Keeps the current timeline while fetching a new language or entry. */
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
    const page = await $orpc.magic.document.itemHistory({ slug: apiSlug.value, itemId: itemId.value, locale: currentLocale.value, versionTag: entryVersion.value });
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

watch([apiSlug, itemId, entryVersion, currentLocale], load, { immediate: true });

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
  justify-content: center;
  flex-wrap: wrap;
  text-align: center;
  gap: 0.35rem 0.55rem;
}
</style>
