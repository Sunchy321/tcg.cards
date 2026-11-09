<template>
  <div class="document-reader min-h-dvh font-sans text-default">
    <div class="sticky top-0 z-50 bg-linear-to-br from-(--color-theme-from) via-(--color-theme-via) to-(--color-theme-to) max-sm:[&_header_[data-slot=center]]:min-w-0 max-sm:[&_header_[data-slot=center]>span]:truncate">
      <AppHeader />
    </div>

    <DocumentControls
      v-if="summaryReady"
      :versions="summary.versions"
      :version-tag="summary.version.versionTag"
      :locale="currentLocale"
      :compare-to="compareTo"
      @version="selectVersion"
      @locale="selectLocale"
    />

    <DocumentDownloads
      v-if="summaryReady && slugBase === 'comprehensive-rules'"
      :key="summary.version.id"
      :files="summary.files ?? []"
    />

    <DocumentOutline
      v-if="(summary.document.settings?.outline ?? true) && summary.outline.length"
      :items="summary.outline"
      :node-id="currentNodeId"
      :chapter-node-id="currentChapterNodeId"
      @select="navigateToItem"
    />

    <main class="mx-auto w-[calc(100%-3rem)] max-w-240 pb-32 pt-12 [overflow-anchor:none] sm:w-[calc(100%-6rem)] sm:pt-20">
      <div v-if="pendingSummary" class="flex justify-center py-16" role="status">
        <UIcon name="lucide:loader" class="size-5 animate-spin text-stone-400 motion-reduce:animate-none" :aria-label="$t('magic.document.loading')" />
      </div>
      <div v-else-if="summaryFailed" role="alert" class="space-y-4 py-8 text-sm">
        <p>{{ $t('magic.document.load_failed') }}</p>
        <UButton color="neutral" variant="ghost" @click="loadSummary">{{ $t('magic.document.retry') }}</UButton>
      </div>

      <template v-else-if="summaryReady">
        <div v-if="summary.document.canManage" class="mb-6 flex justify-end">
          <UButton color="neutral" variant="soft" icon="lucide:git-compare-arrows" :loading="computingRelations" @click="computeRelations">
            {{ $t('magic.document.compute_relations') }}
          </UButton>
        </div>
        <div ref="previousSentinel" class="h-px" aria-hidden="true" />
        <div v-if="pending === 'previous'" class="py-4 text-center text-xs text-stone-500" role="status">{{ $t('magic.document.loading') }}</div>
        <div v-if="failed === 'previous'" class="py-4 text-sm" role="alert">
          <span>{{ $t('magic.document.load_failed') }}</span>
          <UButton color="neutral" variant="ghost" @click="retryReading">{{ $t('magic.document.retry') }}</UButton>
        </div>

        <article ref="article" :aria-label="documentName" :aria-busy="pending === 'navigation'">
          <DocumentReaderSection
            v-for="section in sections"
            :key="section.nodeId"
            :section="section"
            :slug="slugBase"
            :version-tag="summary.version.versionTag"
            :history-enabled="summary.document.settings?.historyPublic === true"
          />
        </article>

        <div ref="nextSentinel" class="h-px" aria-hidden="true" />
        <div v-if="pending === 'navigation' || pending === 'next'" class="py-8 text-center text-xs text-stone-500" role="status">{{ $t('magic.document.loading') }}</div>
        <div v-if="failed === 'navigation' || failed === 'next'" class="py-8 text-sm" role="alert">
          <span>{{ $t('magic.document.load_failed') }}</span>
          <UButton color="neutral" variant="ghost" @click="retryReading">{{ $t('magic.document.retry') }}</UButton>
        </div>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { DocumentOutlineItem, DocumentReaderSummary } from '#model/magic/schema/document-page';

definePageMeta({
  layout:   false,
  game:     'magic',
  // Imported storage identifiers are not alternative public document addresses.
  validate: route => !('slug' in route.params && route.params.slug === 'magic-cr'),
});

const { $orpc } = useNuxtApp();
const i18n = useI18n();
const session = authClient.useSession();
const route = useRoute('document-slug');
const router = useRouter();
const article = useTemplateRef('article');
const previousSentinel = useTemplateRef('previousSentinel');
const nextSentinel = useTemplateRef('nextSentinel');
const slugBase = computed(() => String(route.params.slug ?? 'comprehensive-rules'));
const apiSlug = computed(() => slugBase.value === 'comprehensive-rules' ? 'magic-cr' : slugBase.value);
const versionQuery = computed(() => typeof route.query.version === 'string' ? route.query.version : undefined);
const currentLocale = computed(() => {
  // Explicit reading choices survive shared links; otherwise follow the interface,
  // independently of the game's card/data locale setting.
  const selected = route.query.locale;
  return selected === 'en' || selected === 'zhs' ? selected : i18n.locale.value === 'zhs' ? 'zhs' : 'en';
});
const summary = shallowRef<DocumentReaderSummary>({
  document: { id: '', slug: '', name: '' },
  version:  { id: '', versionTag: '', effectiveDate: '1970-01-01', publishedAt: null, isLatest: false },
  versions: [],
  outline:  [],
});
const documentName = computed(() => slugBase.value === 'comprehensive-rules' ? i18n.t('magic.document.names.cr') : summary.value.document.name);
const compareTo = computed(() => {
  if (!summary.value.document.settings?.compare || summary.value.versions.length < 2) return undefined;
  const index = summary.value.versions.findIndex(version => version.versionTag === summary.value.version.versionTag);
  const older = summary.value.versions[index + 1];
  const newer = summary.value.versions[index - 1];
  const from = older?.versionTag ?? summary.value.version.versionTag;
  const to = older ? summary.value.version.versionTag : newer?.versionTag;
  return to == null ? undefined : { path: `/document/${slugBase.value}/diff`, query: { from, to, locale: currentLocale.value } };
});

/** Keep the selected rule and reading language while opening another edition. */
function selectVersion(version: string) {
  void router.push({ query: { ...route.query, version, locale: currentLocale.value }, hash: route.hash });
}

/** Keep the selected edition and rule while changing only the reading language. */
function selectLocale(locale: string) {
  void router.push({ query: { ...route.query, locale }, hash: route.hash });
}

const computingRelations = ref(false);

/** Prepare this author's published editions independently of reading or publishing. */
async function computeRelations() {
  if (computingRelations.value || !summary.value.document.canManage) return;
  computingRelations.value = true;
  try {
    await $orpc.magic.document.computeRelations({ documentId: summary.value.document.id });
    useToast().add({ title: i18n.t('magic.document.relations_ready'), color: 'success' });
  } catch {
    useToast().add({ title: i18n.t('magic.document.relations_failed'), color: 'error' });
  } finally {
    computingRelations.value = false;
  }
}

const pendingSummary = ref(false);
const summaryFailed = ref(false);
const summaryReady = ref(false);
const currentNodeId = ref('');
const navigating = ref(false);
let summaryToken = 0;
let navigationToken = 0;
let observer: IntersectionObserver | undefined;
let animationFrame = 0;

const stream = useDocumentStream(
  () => (summary.value.document.settings?.outline ?? true) && summary.value.outline.length ? summary.value.outline.map(item => item.nodeId) : [''],
  chapterNodeId => $orpc.magic.document.chapter({
    slug: apiSlug.value, versionTag: summary.value.version.versionTag, locale: currentLocale.value, chapterNodeId,
  }),
);
const { sections, pending, failed, hasPrevious, hasNext } = stream;

/** Resolves any descendant to the top-level chapter accepted by the serving API. */
function findChapter(items: DocumentOutlineItem[], nodeId: string, root?: string): string | undefined {
  for (const item of items) {
    const chapter = root ?? item.nodeId;
    if (item.nodeId === nodeId) return chapter;
    const found = findChapter(item.children ?? [], nodeId, chapter);
    if (found != null) return found;
  }
  return undefined;
}

/** Resolves body-only rule anchors that are absent from the heading outline. */
function chapterForNode(nodeId: string) {
  const found = findChapter(summary.value.outline, nodeId);
  if (found != null) return found;
  const prefix = nodeId.match(/^(\d+)/)?.[1];
  const numeric = prefix ? Number(prefix) : undefined;
  const inferred = numeric != null ? String(numeric >= 100 ? Math.floor(numeric / 100) : numeric) : nodeId.split('.')[0];
  return summary.value.outline.find(item => item.nodeId === inferred)?.nodeId ?? summary.value.outline[0]?.nodeId ?? '';
}

const currentChapterNodeId = computed(() => chapterForNode(currentNodeId.value));

/** Decodes existing shared links without allowing malformed percent escapes to break reading. */
function requestedNode() {
  const raw = route.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Scrolls only after explicit navigation; reading-position updates never trigger scrolling. */
async function openNode(nodeId: string, scroll = true) {
  const token = ++navigationToken;
  navigating.value = true;
  const chapter = chapterForNode(nodeId);
  const opened = await stream.open(chapter, nodeId);
  if (token !== navigationToken) return;
  if (opened) {
    currentNodeId.value = sections.value.some(section => section.nodeId === nodeId) ? nodeId : sections.value[0]?.nodeId ?? '';
    await nextTick();
    if (token !== navigationToken) return;
    if (scroll && import.meta.client) document.getElementById(currentNodeId.value)?.scrollIntoView({ block: 'start' });
  }
  navigating.value = false;
  checkBoundaries();
}

/** Resets cached reading intervals whenever the document, version, or translation changes. */
async function loadSummary() {
  const token = ++summaryToken;
  navigationToken += 1;
  observer?.disconnect();
  stream.reset();
  navigating.value = false;
  summaryReady.value = false;
  pendingSummary.value = true;
  summaryFailed.value = false;
  try {
    const data = await $orpc.magic.document.summary({ slug: apiSlug.value, versionTag: versionQuery.value, locale: currentLocale.value });
    if (token !== summaryToken) return;
    summary.value = data;
    summaryReady.value = true;
    // Mount the reading surface before an awaited chapter read attempts to locate its anchor.
    pendingSummary.value = false;
    const node = requestedNode();
    await openNode(node !== '' ? node : data.outline[0]?.nodeId ?? '', node !== '');
  } catch {
    if (token === summaryToken) summaryFailed.value = true;
  } finally {
    if (token === summaryToken) pendingSummary.value = false;
  }
}

/** Keeps the visible rule stationary when earlier batches are inserted above it. */
async function extendReading(direction: 'previous' | 'next') {
  if (pending.value || failed.value || navigating.value) return;
  const token = navigationToken;
  let anchor: HTMLElement | null | undefined;
  let top: number | undefined;
  const changed = await stream.extend(direction, () => {
    // Measure after the request finishes so scrolling during network waits is retained.
    anchor = article.value?.querySelector<HTMLElement>('[data-node-id]');
    top = anchor?.getBoundingClientRect().top;
  });
  if (!changed || token !== navigationToken) return;
  await nextTick();
  if (token !== navigationToken) return;
  // Use a retained element rather than document height, which images and fonts can change independently.
  if (direction === 'previous' && anchor?.isConnected && top != null) window.scrollBy(0, anchor.getBoundingClientRect().top - top);
  checkBoundaries();
}

/** Continues automatically when the next small batch cannot yet fill the viewport. */
function checkBoundaries() {
  if (!import.meta.client || navigating.value || pending.value || failed.value) return;
  const previous = previousSentinel.value?.getBoundingClientRect();
  if (hasPrevious.value && previous && previous.bottom >= -500 && previous.top <= window.innerHeight + 500) {
    void extendReading('previous');
    return;
  }
  const next = nextSentinel.value?.getBoundingClientRect();
  if (hasNext.value && next && next.top < window.innerHeight + 500) void extendReading('next');
}

/** Reconnects viewport sentinels after initial loading or navigation changes the rendered tree. */
function observeBoundaries() {
  observer?.disconnect();
  if (!import.meta.client) return;
  observer = new IntersectionObserver(entries => {
    if (navigating.value || pending.value || failed.value) return;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (entry.target === previousSentinel.value && hasPrevious.value) void extendReading('previous');
      else if (entry.target === nextSentinel.value && hasNext.value) void extendReading('next');
    }
  }, { rootMargin: '500px 0px' });
  if (previousSentinel.value) observer.observe(previousSentinel.value);
  if (nextSentinel.value) observer.observe(nextSentinel.value);
  checkBoundaries();
}

/** Updates directory selection from reading position without rewriting a shared link on every scroll. */
function updatePosition() {
  animationFrame = 0;
  if (navigating.value) return;
  const elements = article.value?.querySelectorAll<HTMLElement>('[data-node-id]');
  if (!elements?.length) return;
  let active = elements[0]!;
  for (const element of elements) {
    if (element.getBoundingClientRect().top > 160) break;
    active = element;
  }
  currentNodeId.value = active.dataset.nodeId ?? '';
}

/** Coalesces scroll work into one reading-position update per paint. */
function onScroll() {
  if (!animationFrame) animationFrame = requestAnimationFrame(updatePosition);
}

/** Makes explicit directory navigation shareable while supporting repeat clicks on the current hash. */
function navigateToItem(nodeId: string) {
  if (requestedNode() === nodeId) void openNode(nodeId);
  else void router.push({ hash: `#${encodeURIComponent(nodeId)}`, query: route.query });
}

/** Retries a failed boundary request while preserving reading position above already loaded content. */
async function retryReading() {
  const direction = failed.value;
  if (direction === 'navigation') {
    await openNode(requestedNode() !== '' ? requestedNode() : summary.value.outline[0]?.nodeId ?? '');
    return;
  }
  let anchor: HTMLElement | null | undefined;
  let top: number | undefined;
  const token = navigationToken;
  const changed = await stream.retry(() => {
    anchor = article.value?.querySelector<HTMLElement>('[data-node-id]');
    top = anchor?.getBoundingClientRect().top;
  });
  await nextTick();
  if (token !== navigationToken) return;
  if (changed && direction === 'previous' && anchor?.isConnected && top != null) window.scrollBy(0, anchor.getBoundingClientRect().top - top);
  checkBoundaries();
}

// Management capabilities belong to the active session, including account changes.
watch(() => session.value.data?.user.id, () => {
  summary.value = { ...summary.value, document: { ...summary.value.document, canManage: false } };
  void loadSummary();
});

watch([apiSlug, versionQuery, currentLocale], () => {
  void loadSummary();
}, { immediate: true });

watch(() => route.hash, () => {
  if (summaryReady.value && !pendingSummary.value) {
    void openNode(requestedNode());
  }
});

watch([previousSentinel, nextSentinel], observeBoundaries, { flush: 'post' });

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', checkBoundaries, { passive: true });
  observeBoundaries();
});
onBeforeUnmount(() => {
  summaryToken += 1;
  navigationToken += 1;
  stream.reset();
  observer?.disconnect();
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', checkBoundaries);
  cancelAnimationFrame(animationFrame);
});

useTitle(() => documentName.value);
</script>

<style scoped>
.document-reader {
  --reader-bg: var(--ui-bg);
  --reader-muted: var(--ui-text-muted);
  --reader-line: var(--ui-border);
  --reader-accent: var(--ui-primary);
  background: var(--reader-bg);
}
</style>
