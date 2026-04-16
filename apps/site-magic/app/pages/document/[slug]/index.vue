<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-950">
    <div class="mx-auto flex max-w-400 gap-0 px-3 py-4 sm:px-4">
      <aside
        class="hidden w-72 shrink-0 border-r border-neutral-200 bg-white/85 pr-4 backdrop-blur dark:border-white/10 dark:bg-white/5 lg:block"
      >
        <div class="sticky top-16 space-y-4 pb-6 pt-2">
          <div class="rounded-2xl border border-neutral-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div class="space-y-3">
              <USelect
                :model-value="currentVersionTag"
                :items="versionItems"
                size="sm"
                class="w-full"
                @update:model-value="value => setVersion(value as string)"
              />

              <NuxtLink :to="diffLink" class="block">
                <UButton icon="lucide:file-diff" variant="outline" size="sm" block>
                  {{ $t('magic.document.compare_versions') }}
                </UButton>
              </NuxtLink>
            </div>
          </div>

          <div class="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div class="mb-3 flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-400 dark:text-white/40">
                {{ $t('magic.document.outline') }}
              </span>
              <span class="text-xs text-neutral-400 dark:text-white/40">
                {{ page.outline.length }}
              </span>
            </div>

            <UTree
              :items="treeItems"
              :model-value="selectedTreeItem"
              :get-key="item => item.nodeId"
              :default-expanded="defaultExpanded"
              color="neutral"
              size="sm"
              :expanded-icon="null"
              :collapsed-icon="null"
              @select="(_, item) => navigateToItem(item.nodeId)"
            >
              <template #item="{ item, expanded, selected, handleSelect, handleToggle, ui }">
                <div
                  :class="ui.link({ selected })"
                >
                  <button
                    type="button"
                    class="min-w-0 flex-1 truncate text-left"
                    @click="handleSelect"
                  >
                    {{ item.label }}
                  </button>

                  <button
                    v-if="item.children?.length"
                    type="button"
                    class="ml-2 flex size-5 shrink-0 items-center justify-center rounded-sm text-neutral-400 transition hover:text-neutral-700 dark:text-white/45 dark:hover:text-white/80"
                    @click.stop="handleToggle"
                  >
                    <UIcon
                      name="lucide:chevron-right"
                      class="size-4 transition-transform"
                      :class="{ 'rotate-90': expanded }"
                    />
                  </button>
                </div>
              </template>
            </UTree>
          </div>
        </div>
      </aside>

      <main class="min-w-0 flex-1 px-0 lg:px-8">
        <div class="min-w-0 px-5 py-6 sm:px-8">
          <div class="mx-auto max-w-5xl">
            <div class="space-y-4 lg:hidden">
              <USelect
                :model-value="currentVersionTag"
                :items="versionItems"
                size="sm"
                class="w-full"
                @update:model-value="value => setVersion(value as string)"
              />
              <NuxtLink :to="diffLink" class="block">
                <UButton icon="lucide:file-diff" variant="outline" size="sm" block>
                  {{ $t('magic.document.compare_versions') }}
                </UButton>
              </NuxtLink>
            </div>

            <div class="mt-4 lg:mt-0">
              <div
                v-if="isLoading"
                class="flex justify-center px-5 py-16"
              >
                <UIcon name="lucide:loader" class="h-12 w-12 animate-spin text-neutral-400 dark:text-white/45" />
              </div>
              <div
                v-else-if="errorMessage"
                class="rounded-3xl border border-rose-300 bg-rose-50/80 px-5 py-8 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
              >
                {{ errorMessage }}
              </div>
              <article
                v-else
                class="article-shell"
              >
                <section
                  v-for="section in page.sections"
                  :id="section.nodeId"
                  :key="section.nodeId"
                  :class="[
                    'article-block group',
                    `article-depth-${Math.min(section.level, 4)}`,
                    {
                      'is-active':  section.nodeId === currentNodeId,
                      'is-example': section.kind === 'example',
                    },
                  ]"
                >
                  <div class="article-meta">
                    <div class="article-tools">
                      <UButton
                        icon="lucide:copy"
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        :title="$t('magic.document.copy_text')"
                        :aria-label="$t('magic.document.copy_text')"
                        @click="copySectionText(section)"
                      />
                      <UButton
                        icon="lucide:link"
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        :title="$t('magic.document.copy_link')"
                        :aria-label="$t('magic.document.copy_link')"
                        @click="copyAnchor(section.nodeId)"
                      />
                      <UButton
                        icon="lucide:history"
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        disabled
                      />
                    </div>
                  </div>

                  <component
                    :is="headingTag(section)"
                    v-if="isHeadingLike(section) && section.text"
                    :class="headingClass(section)"
                  >
                    <span v-if="section.serial" class="article-serial">{{ section.serial }}</span>
                    <span>{{ section.text }}</span>
                  </component>

                  <div
                    v-else-if="section.text"
                    :class="contentClass(section)"
                  >
                    <div
                      v-if="section.kind === 'example'"
                      class="article-example-label"
                    >
                      {{ $t('magic.document.example') }}
                    </div>
                    <p
                      v-for="(paragraph, index) in sectionParagraphs(section)"
                      :key="`${section.nodeId}-${index}`"
                    >
                      <span
                        v-if="index === 0 && section.serial && section.kind !== 'example'"
                        class="article-serial"
                      >
                        {{ section.serial }}
                      </span>
                      {{ paragraph }}
                    </p>
                  </div>
                </section>
              </article>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  DocumentOutlineItem,
  DocumentReaderChapter,
  DocumentReaderPage,
  DocumentReaderSection,
  DocumentReaderSummary,
} from '#model/magic/schema/document-page';
import { locale as localeSchema } from '#model/magic/schema/basic';

definePageMeta({
  layout: 'main',
  game:   'magic',
});

type TreeItem = {
  label:     string;
  nodeId:    string;
  children?: TreeItem[];
};

const { $orpc } = useNuxtApp();
const i18n = useI18n();
const route = useRoute('document-slug');
const router = useRouter();

const slugBase = computed(() => String(route.params.slug ?? 'cr'));
const apiSlug = computed(() => slugBase.value === 'cr' ? 'magic-cr' : slugBase.value);
const versionQuery = computed(() => {
  const raw = route.query.version;
  return typeof raw === 'string' ? raw : undefined;
});
const currentLocale = computed(() => {
  const raw = route.query.locale;
  const parsed = localeSchema.safeParse(raw);
  return parsed.success ? parsed.data : 'en';
});

const emptySummary: DocumentReaderSummary = {
  document: {
    id:   '',
    slug: '',
    name: i18n.t('magic.document.$self'),
  },
  version: {
    id:            '',
    versionTag:    '',
    effectiveDate: '1970-01-01',
    publishedAt:   null,
    isLatest:      false,
  },
  versions: [],
  outline:  [],
};

const summary = ref<DocumentReaderSummary>(emptySummary);
const chapter = ref<DocumentReaderChapter | null>(null);
const page = computed<DocumentReaderPage>(() => ({
  ...summary.value,
  sections: chapter.value?.sections ?? [],
}));

const documentName = computed(() => {
  if (slugBase.value === 'cr') {
    return i18n.t('magic.document.names.cr');
  }

  return page.value.document.name;
});

const pendingSummary = ref(false);
const pendingChapter = ref(false);
const errorMessage = ref<string | null>(null);
const isLoading = computed(() => pendingSummary.value || pendingChapter.value);

let summaryToken = 0;
let chapterToken = 0;

const loadSummary = async () => {
  const token = ++summaryToken;
  chapterToken += 1;
  pendingSummary.value = true;
  pendingChapter.value = false;
  errorMessage.value = null;
  chapter.value = null;

  try {
    const data = await $orpc.magic.document.summary({
      slug:       apiSlug.value,
      versionTag: versionQuery.value,
      locale:     currentLocale.value,
    });

    if (token !== summaryToken) {
      return;
    }

    summary.value = data;
  } catch (error) {
    if (token !== summaryToken) {
      return;
    }

    console.error(error);
    errorMessage.value = i18n.t('magic.document.load_failed');
    summary.value = emptySummary;
  } finally {
    if (token === summaryToken) {
      pendingSummary.value = false;
    }
  }
};

const findChapterNodeId = (
  items: DocumentOutlineItem[],
  nodeId: string,
  rootNodeId?: string,
): string | undefined => {
  for (const item of items) {
    const nextRootNodeId = rootNodeId ?? item.nodeId;

    if (item.nodeId === nodeId) {
      return nextRootNodeId;
    }

    const child = findChapterNodeId(item.children ?? [], nodeId, nextRootNodeId);
    if (child) {
      return child;
    }
  }

  return undefined;
};

const inferChapterNodeId = (nodeId: string): string | undefined => {
  if (!nodeId) {
    return undefined;
  }

  if (nodeId === 'intro' || nodeId.startsWith('intro.')) {
    return 'intro';
  }

  if (nodeId === 'glossary' || nodeId.startsWith('glossary.')) {
    return 'glossary';
  }

  if (nodeId === 'credits' || nodeId.startsWith('credits.')) {
    return 'credits';
  }

  const numericPrefix = nodeId.match(/^(\d+)/)?.[1];
  if (!numericPrefix) {
    return undefined;
  }

  const value = Number(numericPrefix);
  if (Number.isNaN(value)) {
    return undefined;
  }

  return value >= 100 ? String(Math.floor(value / 100)) : String(value);
};

const requestedNodeId = computed(() => {
  const hash = route.hash.startsWith('#') ? route.hash.slice(1) : '';
  if (hash !== '') {
    return hash;
  }

  return summary.value.outline[0]?.nodeId ?? '';
});

const currentChapterNodeId = computed(() =>
  findChapterNodeId(summary.value.outline, requestedNodeId.value)
  ?? inferChapterNodeId(requestedNodeId.value)
  ?? summary.value.outline[0]?.nodeId
  ?? '',
);

const scrollToSection = async () => {
  if (!import.meta.client || !currentNodeId.value) {
    return;
  }

  await nextTick();

  const element = document.getElementById(currentNodeId.value);
  if (!element) {
    return;
  }

  const headerHeight = document.querySelector('header')?.clientHeight ?? 72;
  const top = element.getBoundingClientRect().top + window.scrollY - headerHeight - 8;
  window.scrollTo({ top, behavior: 'smooth' });
};

const loadChapter = async (chapterNodeId: string) => {
  const token = ++chapterToken;
  pendingChapter.value = true;
  errorMessage.value = null;

  try {
    const data = await $orpc.magic.document.chapter({
      slug:       apiSlug.value,
      versionTag: versionQuery.value,
      locale:     currentLocale.value,
      chapterNodeId,
    });

    if (token !== chapterToken) {
      return;
    }

    chapter.value = data;
    await scrollToSection();
  } catch (error) {
    if (token !== chapterToken) {
      return;
    }

    console.error(error);
    errorMessage.value = i18n.t('magic.document.load_failed');
    chapter.value = null;
  } finally {
    if (token === chapterToken) {
      pendingChapter.value = false;
    }
  }
};

watch([apiSlug, versionQuery, currentLocale], () => {
  void loadSummary();
}, { immediate: true });

const currentVersionTag = computed(() => page.value?.version.versionTag ?? '');
const versionItems = computed(() => (page.value?.versions ?? []).map(version => ({
  label: `${version.versionTag} · ${version.effectiveDate}`,
  value: version.versionTag,
})));

const currentNodeId = computed(() => {
  if (!requestedNodeId.value) {
    return page.value.sections[0]?.nodeId ?? '';
  }

  return page.value.sections.some(section => section.nodeId === requestedNodeId.value)
    ? requestedNodeId.value
    : page.value.sections[0]?.nodeId ?? '';
});

const splitParagraphs = (content: string | null): string[] => {
  if (!content) {
    return [];
  }

  return content
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(part => part.length > 0);
};

const sectionParagraphs = (section: DocumentReaderSection): string[] => {
  const paragraphs = splitParagraphs(section.text);
  if (section.kind !== 'example' || !paragraphs[0]) {
    return paragraphs;
  }

  return [
    paragraphs[0].replace(/^Example:\s*/, ''),
    ...paragraphs.slice(1),
  ];
};

const isHeadingLike = (section: DocumentReaderSection): boolean =>
  section.kind === 'heading' || section.nodeId.endsWith('.title');

const headingTag = (section: DocumentReaderSection): 'h2' | 'h3' | 'h4' | 'h5' => {
  if (isHeadingLike(section)) {
    if (section.level <= 0) {
      return 'h2';
    }

    if (section.level === 1) {
      return 'h3';
    }

    if (section.level === 2) {
      return 'h4';
    }
  }

  return 'h5';
};

const headingClass = (section: DocumentReaderSection): string => {
  if (isHeadingLike(section)) {
    if (section.level <= 0) {
      return 'article-title article-title-main';
    }

    if (section.level === 1) {
      return 'article-title article-title-section';
    }

    if (section.level === 2) {
      return 'article-title article-title-subsection';
    }
  }

  if (section.kind === 'implicit_heading') {
    return 'article-title article-title-implicit-heading';
  }

  if (section.kind === 'example') {
    return 'article-title article-title-example';
  }

  return 'article-title article-title-inline';
};

const contentClass = (section: DocumentReaderSection): string => {
  if (section.kind === 'example') {
    return 'article-content article-content-example';
  }

  if (section.kind === 'implicit_heading') {
    return 'article-content article-content-implicit-heading';
  }

  return 'article-content';
};

const mapTree = (items: DocumentOutlineItem[]): TreeItem[] =>
  items.map(item => ({
    label:  item.serial ? `${item.serial} ${item.label}` : item.label,
    nodeId: item.nodeId,
    ...(item.children?.length ? { children: mapTree(item.children) } : {}),
  }));

const treeItems = computed(() => mapTree(page.value?.outline ?? []));
const defaultExpanded = computed(() => currentChapterNodeId.value ? [currentChapterNodeId.value] : []);

const selectedTreeItem = computed<TreeItem | undefined>(() => {
  const activeNodeId = currentNodeId.value !== ''
    ? currentNodeId.value
    : requestedNodeId.value;

  const findTree = (items: TreeItem[]): TreeItem | undefined => {
    for (const item of items) {
      if (item.nodeId === activeNodeId) {
        return item;
      }

      const child = findTree(item.children ?? []);
      if (child) {
        return child;
      }
    }

    return undefined;
  };

  return findTree(treeItems.value);
});

const diffLink = computed(() => ({
  path:  `/document/${slugBase.value}/diff`,
  query: {
    from: page.value?.versions.at(1)?.versionTag ?? page.value?.version.versionTag ?? '',
    to:   page.value?.version.versionTag ?? '',
  },
}));

const setVersion = (version: string) => {
  void router.push({
    query: {
      ...route.query,
      version,
    },
  });
};

const navigateToItem = (nodeId: string) => {
  void router.push({
    hash:  `#${nodeId}`,
    query: route.query,
  });
};

const sectionText = (section: DocumentReaderSection): string => {
  const text = section.text?.trim() ?? '';

  if (!section.serial) {
    return text;
  }

  return text ? `${section.serial} ${text}` : section.serial;
};

const copySectionText = async (section: DocumentReaderSection) => {
  await navigator.clipboard.writeText(sectionText(section));
};

const copyAnchor = async (nodeId: string) => {
  const url = new URL(window.location.href);
  url.hash = nodeId;
  await navigator.clipboard.writeText(url.toString());
};

watch([() => summary.value.version.id, currentChapterNodeId], ([versionId, chapterNodeId], [prevVersionId, prevChapterNodeId]) => {
  if (!versionId || !chapterNodeId) {
    return;
  }

  if (versionId === prevVersionId && chapterNodeId === prevChapterNodeId) {
    return;
  }

  void loadChapter(chapterNodeId);
});

watch(currentNodeId, (nodeId, prevNodeId) => {
  if (!nodeId || nodeId === prevNodeId) {
    return;
  }

  if (page.value.sections.some(section => section.nodeId === nodeId)) {
    void scrollToSection();
  }
});

useTitle(() => documentName.value ?? slugBase.value);
</script>

<style lang="scss" scoped>
.article-shell {
  padding: 0.25rem 0 1rem;
}

.article-block {
  position: relative;
  padding: 0.7rem 0 0.9rem;
}

.article-block.is-active {
  background: transparent;
}

.article-block.is-example {
  margin-left: 1.25rem;
  padding: 0.25rem 0 0.65rem 1rem;
  border-left: 2px solid rgb(212 212 212 / 0.85);
}

.dark .article-block.is-example {
  border-left-color: rgb(255 255 255 / 0.16);
}

.article-meta {
  position: absolute;
  top: 0.9rem;
  right: 0;
  z-index: 10;
  pointer-events: none;
}

.article-tools {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem;
  border: 1px solid rgb(229 229 229 / 0.85);
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.92);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.08);
  opacity: 1;
  pointer-events: auto;
  transition: opacity 0.2s ease;
}

.dark .article-tools {
  border-color: rgb(255 255 255 / 0.1);
  background: rgb(23 23 23 / 0.88);
  box-shadow: 0 12px 30px rgb(0 0 0 / 0.24);
}

@media (min-width: 1024px) {
  .article-tools {
    opacity: 0;
  }

  .article-block:hover .article-tools {
    opacity: 1;
  }
}

.article-title {
  margin-top: 0.35rem;
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.15;
  color: rgb(23 23 23);
  text-wrap: balance;
}

.dark .article-title {
  color: rgb(255 255 255 / 0.96);
}

.article-title-main {
  font-size: 2rem;
  font-weight: 650;
  letter-spacing: -0.04em;
}

.article-title-section {
  font-size: 1.5rem;
  font-weight: 620;
  letter-spacing: -0.03em;
}

.article-title-subsection {
  font-size: 1.18rem;
  font-weight: 620;
}

.article-title-implicit-heading,
.article-title-example,
.article-title-inline {
  font-size: 1rem;
  font-weight: 600;
}

.article-serial {
  margin-right: 0.45rem;
  font-size: 0.88em;
  font-weight: 600;
  color: rgb(115 115 115);
}

.dark .article-serial {
  color: rgb(255 255 255 / 0.45);
}

.article-content {
  margin-top: 0.4rem;
  max-width: 44rem;
  color: rgb(64 64 64);
}

.dark .article-content {
  color: rgb(255 255 255 / 0.76);
}

.article-content :deep(p),
.article-content p {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.9;
  white-space: pre-line;
}

.article-content p + p {
  margin-top: 0.45rem;
}

.article-content-implicit-heading {
  font-size: 1rem;
}

.article-content-example {
  margin-top: 0;
  max-width: 40rem;
  font-size: 0.95rem;
}

.article-example-label {
  display: inline-flex;
  align-items: center;
  margin-bottom: 0.35rem;
  padding: 0.12rem 0.45rem;
  border: 1px solid rgb(212 212 212 / 0.85);
  border-radius: 9999px;
  color: rgb(82 82 82);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dark .article-example-label {
  border-color: rgb(255 255 255 / 0.14);
  color: rgb(255 255 255 / 0.58);
}

.article-depth-0 {
  padding-top: 0.95rem;
  padding-bottom: 1.1rem;
}

.article-depth-1,
.article-depth-2 {
  padding-top: 0.75rem;
}

@media (max-width: 640px) {
  .article-title-main {
    font-size: 1.7rem;
  }

  .article-title-section {
    font-size: 1.32rem;
  }
}
</style>
