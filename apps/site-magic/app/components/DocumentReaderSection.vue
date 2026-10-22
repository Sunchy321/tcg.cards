<template>
  <section
    :id="section.nodeId"
    ref="root"
    :data-node-id="section.nodeId"
    class="group/section relative scroll-mt-24 font-sans leading-[1.8] wrap-anywhere after:absolute after:left-full after:top-0 after:h-full after:w-16 after:content-[''] sm:leading-[1.95] [&_a]:text-(--reader-accent) [&_a]:underline [&_a]:decoration-(--reader-line) [&_a]:underline-offset-[0.2em]"
    :class="[
      isHeading ? 'pb-5 pt-11' : 'py-3',
      isHeading && section.level === 0 ? 'not-first:mt-10' : '',
      section.kind === 'example' ? 'my-2 mb-4 ml-6 border-l border-(--reader-line) py-1 pl-5 text-[0.9375rem] text-(--reader-muted)' : 'text-base sm:text-[1.0625rem]',
    ]"
    @click="onSectionClick"
  >
    <span v-if="section.localeState.isFallback" class="mb-2 block text-xs text-(--reader-muted)">
      {{ $t('magic.document.translation_missing') }}
    </span>
    <component
      :is="headingTag"
      v-if="isHeading && section.text"
      class="font-sans font-medium text-highlighted"
      :class="headingClass"
    >
      <span v-if="section.serial" class="mr-[0.85em] font-sans text-[0.7em] font-normal text-(--reader-muted) tabular-nums">{{ section.serial }}</span>
      <DocumentText :text="section.text" :markers="section.markers" :slug="slug" :version-tag="versionTag" />
    </component>
    <div v-else-if="section.text" :class="{ 'font-medium': section.kind === 'implicit_heading' }">
      <span v-if="section.kind === 'example'" class="mb-2 block font-sans text-[0.65rem] tracking-widest text-muted">
        {{ $t('magic.document.example') }}
      </span>
      <p v-for="(paragraph, index) in paragraphs" :key="index" class="m-0 whitespace-pre-line [&+p]:mt-3">
        <span v-if="index === 0 && section.serial && section.kind !== 'example'" class="mr-[0.85em] font-sans text-[0.7em] font-normal text-(--reader-muted) tabular-nums">{{ section.serial }}</span>
        <DocumentText :text="paragraph" :markers="paragraphMarkers(index)" :slug="slug" :version-tag="versionTag" />
      </p>
    </div>
    <!-- Entry tools float outside the reading column, like the history page's lineage icons. -->
    <div
      v-if="slug === 'comprehensive-rules' && section.text"
      data-rule-toolbar
      class="pointer-events-none absolute top-0 left-full z-10 ml-3 flex flex-col items-start gap-1 opacity-0 transition-opacity hover:pointer-events-auto hover:opacity-100 max-sm:left-auto max-sm:right-0 max-sm:ml-0 group-hover/section:pointer-events-auto group-hover/section:opacity-100 group-focus-within/section:pointer-events-auto group-focus-within/section:opacity-100"
      :style="revealed ? { opacity: 1, pointerEvents: 'auto' } : undefined"
    >
      <UButton
        icon="lucide:copy"
        size="xs"
        variant="ghost"
        color="neutral"
        :aria-label="$t('magic.document.copy_text')"
        :title="$t('magic.document.copy_text')"
        @click="copyText"
      />
      <UButton
        :to="sectionLink"
        icon="lucide:link"
        size="xs"
        variant="ghost"
        color="neutral"
        :aria-label="$t('magic.document.link_to_section')"
        :title="$t('magic.document.link_to_section')"
      />
      <UButton
        v-if="historyEnabled"
        :to="historyLink"
        target="_blank"
        icon="lucide:history"
        size="xs"
        variant="ghost"
        color="neutral"
        :aria-label="$t('magic.rule.history')"
        :title="$t('magic.rule.history')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DocumentReaderSection } from '#model/magic/schema/document-page';

const props = defineProps<{ section: DocumentReaderSection, slug: string, versionTag: string, historyEnabled?: boolean }>();
const route = useRoute();
const sectionLink = computed(() => ({
  path:  `/document/${props.slug}`,
  query: { ...route.query, version: props.versionTag, node: props.section.nodeId },
  hash:  `#${encodeURIComponent(props.section.nodeId)}`,
}));
const historyLink = computed(() => ({
  path:  `/document/${props.slug}/history`,
  query: { id: props.section.entityId, version: props.versionTag, ...(typeof route.query.locale === 'string' ? { locale: route.query.locale } : {}) },
}));

// Touch pointers have no hover: the first tap on the row summons the tools, the next tap elsewhere dismisses them.
const root = useTemplateRef('root');
const revealed = ref(false);
function dismiss(event: MouseEvent) {
  if (event.target instanceof Element && !root.value?.contains(event.target)) revealed.value = false;
}
function onSectionClick(event: MouseEvent) {
  if (!window.matchMedia('(hover: none)').matches) return;
  if (event.target instanceof Element && event.target.closest('a, button')) return;
  revealed.value = !revealed.value;
}
watch(revealed, value => {
  if (!import.meta.client) return;
  if (value) document.addEventListener('click', dismiss);
  else document.removeEventListener('click', dismiss);
});
onBeforeUnmount(() => {
  if (import.meta.client) document.removeEventListener('click', dismiss);
});
const isHeading = computed(() => props.section.kind === 'heading' || props.section.nodeId.endsWith('.title'));
const headingTag = computed(() => `h${Math.min(5, Math.max(2, props.section.level + 2))}`);
const headingClass = computed(() => {
  if (props.section.level <= 0) return 'text-3xl leading-snug sm:text-4xl';
  if (props.section.level === 1) return 'text-2xl leading-snug';
  return 'text-xl leading-relaxed';
});
const paragraphs = computed(() => {
  const parts = (props.section.text ?? '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean);
  if (props.section.kind === 'example' && parts[0]) parts[0] = parts[0].replace(/^Example:\s*/, '');
  return parts;
});

/** Copies the displayed section number and plain text without toolbar labels. */
async function copyText() {
  await navigator.clipboard.writeText(`${props.section.serial ?? ''} ${props.section.text ?? ''}`.trim());
}

/** Preserves semantic marker offsets after splitting paragraphs and trimming the example prefix. */
function paragraphMarkers(index: number) {
  const text = props.section.text ?? '';
  let start = 0;
  for (let i = 0; i <= index; i++) {
    const position = text.indexOf(paragraphs.value[i] ?? '', start);
    if (position < 0) return [];
    start = position + (i < index ? (paragraphs.value[i]?.length ?? 0) : 0);
  }
  const end = start + (paragraphs.value[index]?.length ?? 0);
  return (props.section.markers ?? []).filter(marker => marker.start < end && marker.end > start)
    .map(marker => ({ ...marker, start: Math.max(marker.start, start) - start, end: Math.min(marker.end, end) - start }));
}
</script>
