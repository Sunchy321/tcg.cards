<template>
  <div v-for="entry in entries" :key="entry.section.nodeId" class="wrap-anywhere py-1 font-sans text-sm leading-[1.8] text-default sm:text-base sm:leading-[1.95]">
    <p v-if="entry.section.localeState.isFallback" class="mb-1 text-xs text-muted">
      {{ $t('magic.document.translation_missing') }}
    </p>
    <component
      :is="entry.section.kind === 'heading' ? (entry.section.level <= 0 ? 'h3' : entry.section.level === 1 ? 'h4' : 'h5') : 'div'"
      :class="entry.section.kind === 'heading' ? ['font-sans font-medium text-balance text-highlighted', entry.section.level <= 0 ? 'text-2xl leading-snug sm:text-3xl' : entry.section.level === 1 ? 'text-xl leading-snug sm:text-2xl' : 'text-lg leading-relaxed'] : { 'my-2 ml-4 border-l border-default py-1 pl-4 text-[0.9375rem] text-muted': entry.section.kind === 'example', 'font-medium': entry.section.kind === 'implicit_heading' }"
    >
      <div v-if="entry.section.kind === 'example'" class="mb-2 block text-[0.65rem] tracking-widest text-muted">{{ $t('magic.document.example') }}</div>
      <component :is="entry.section.kind === 'heading' ? 'span' : 'p'" v-for="(paragraph, index) in entry.paragraphs" :key="index" class="m-0 whitespace-pre-line [&+p]:mt-3">
        <span v-if="index === 0 && entry.section.serial && entry.section.kind !== 'example'" class="mr-[0.85em] font-sans text-[0.7em] font-normal tabular-nums" :class="highlightNumber ? (side === 'from' ? 'rounded bg-red-200/70 px-1 py-0.5 text-red-800 dark:bg-red-800/40 dark:text-red-200' : 'rounded bg-green-200/70 px-1 py-0.5 text-green-800 dark:bg-green-800/40 dark:text-green-200') : 'text-muted'">{{ entry.section.serial }}</span>
        <template v-for="(block, blockIndex) in paragraph" :key="blockIndex">
          <span v-if="block.type === 'removed'" class="rounded px-0.5" :class="block.isMinor ? 'bg-rose-100/60 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' : 'bg-red-200/70 text-red-800 dark:bg-red-800/40 dark:text-red-200'">{{ block.text }}</span>
          <span v-else-if="block.type === 'added'" class="rounded px-0.5" :class="block.isMinor ? 'bg-emerald-100/60 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-green-200/70 text-green-800 dark:bg-green-800/40 dark:text-green-200'">{{ block.text }}</span>
          <template v-else>{{ block.text }}</template>
        </template>
      </component>
    </component>
  </div>
</template>

<script setup lang="ts">
import type { DocumentChangeTextBlock, DocumentChangeTextDiff, DocumentDiffSection } from '#model/magic/schema/document-page';

const props = defineProps<{ sections: DocumentDiffSection[], textDiff: DocumentChangeTextDiff | null, highlightNumber?: boolean, side: 'from' | 'to' }>();

/** Slice a side's joined diff into exact node and paragraph intervals, including Unicode characters. */
function sliceBlocks(blocks: DocumentChangeTextBlock[], start: number, length: number) {
  let position = 0;
  return blocks.flatMap(block => {
    const characters = Array.from(block.text);
    const begin = Math.max(0, start - position);
    const end = Math.min(characters.length, start + length - position);
    position += characters.length;
    return end > begin ? [{ ...block, text: characters.slice(begin, end).join('') }] : [];
  });
}

// Split/merged participants share one joined diff, while their original paragraph
// boundaries and typography remain independent on each side.
const entries = computed(() => {
  const blocks = props.textDiff?.blocks.filter(block => block.type === 'common' || block.type === (props.side === 'from' ? 'removed' : 'added'));
  let offset = 0;
  return props.sections.map(section => {
    const text = section.text ?? '';
    const length = Array.from(text).length;
    const visible = blocks == null ? [{ type: 'common' as const, text }] : sliceBlocks(blocks, offset, length);
    offset += length + 1;
    if (section.kind === 'heading') return { section, paragraphs: [visible] };
    let position = 0;
    const paragraphs = text.split(/(\n{2,})/).flatMap(part => {
      const start = position;
      const size = Array.from(part).length;
      position += size;
      return part.trim() === '' ? [] : [sliceBlocks(visible, start, size)];
    });
    return { section, paragraphs };
  });
});
</script>
